"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function OnboardingPage() {
    const { user, signOut, loading: authLoading } = useAuth();
    const router = useRouter();

    // State
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [privateKeyInput, setPrivateKeyInput] = useState("");
    const [walletAddress, setWalletAddress] = useState("");
    const [appCodeInput, setAppCodeInput] = useState("");

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
        }
    }, [authLoading, user, router]);

    const saveCredentials = async () => {
        if (!walletAddress || !privateKeyInput || !appCodeInput) {
            setStatus("Please fill in all fields.");
            return;
        }

        setLoading(true);
        setStatus("Verifying access code...");

        try {
            // 1. Verify Code
            const { data: codeData, error: codeError } = await supabase
                .from("signup_codes")
                .select("*")
                .eq("code", appCodeInput)
                .single();

            if (codeError || !codeData) {
                setStatus("Invalid or non-existent code.");
                setLoading(false);
                return;
            }

            if (codeData.is_used) {
                setStatus("This code has already been used.");
                setLoading(false);
                return;
            }

            setStatus("Redeeming code...");

            // 2. Mark Code as Used
            const { error: updateError } = await supabase
                .from("signup_codes")
                .update({
                    is_used: true,
                    used_by: walletAddress,
                    used_at: new Date().toISOString()
                })
                .eq("code", appCodeInput)
                .eq("is_used", false);

            if (updateError) {
                setStatus("Code failed to redeem (possibly used just now).");
                setLoading(false);
                return;
            }

            setStatus("Saving encrypted credentials...");

            // 3. Save to Supabase Users
            const { error } = await supabase
                .from("users")
                .upsert({
                    wallet_address: walletAddress,
                    encrypted_private_key: privateKeyInput,
                }, { onConflict: "wallet_address" });

            if (error) throw error;

            // 4. Create settings
            await supabase
                .from("user_settings")
                .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" });

            // 5. Create sniper status
            await supabase
                .from("sniper_status")
                .upsert({ wallet_address: walletAddress, is_running: false }, { onConflict: "wallet_address" });

            localStorage.setItem("bags_onboarded", "true");
            router.push("/dashboard");

        } catch (e: any) {
            console.error("Save error:", e);
            setStatus(`Error: ${e.message}`);
            setLoading(false);
        }
    };

    if (authLoading) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-pulse text-[#00de00]">Loading...</div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,222,0,0.1),transparent_60%)]" />

            <div className="relative z-10 max-w-md w-full bg-[#0a0a0a]/80 backdrop-blur border border-white/10 rounded-2xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold mb-2">Connect Sniper Wallet</h1>
                    <p className="text-gray-500 text-sm">
                        Enter your Solana wallet credentials to enable auto-trading.
                    </p>
                </div>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Access Code</label>
                        <input
                            type="text"
                            placeholder="Enter Invite Code"
                            value={appCodeInput}
                            onChange={(e) => setAppCodeInput(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#00de00]/50"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Wallet Address (Public Key)</label>
                        <input
                            type="text"
                            placeholder="Address (e.g. 5eykt...)"
                            value={walletAddress}
                            onChange={(e) => setWalletAddress(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#00de00] font-mono focus:outline-none focus:border-[#00de00]/50"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Private Key (Base58)</label>
                        <input
                            type="password"
                            placeholder="Private Key (e.g. 4K9s...)"
                            value={privateKeyInput}
                            onChange={(e) => setPrivateKeyInput(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#00de00]/50"
                        />
                        <p className="text-[10px] text-gray-600 mt-1">
                            Stored securely. Used only for automated sniping.
                        </p>
                    </div>
                </div>

                {status && (
                    <div className="text-center text-xs text-yellow-500 mb-4 font-mono">
                        {status}
                    </div>
                )}

                <button
                    onClick={saveCredentials}
                    disabled={loading || !walletAddress || !privateKeyInput || !appCodeInput}
                    className="w-full bg-[#00de00] text-black font-bold py-4 rounded-xl hover:bg-[#00ff00] transition-all shadow-[0_0_30px_rgba(0,222,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Saving..." : "Save & Continue"}
                </button>

                <button
                    onClick={() => signOut()}
                    className="w-full text-gray-500 text-sm mt-6 hover:text-white transition-colors"
                >
                    Logout
                </button>
            </div>
        </main>
    );
}

"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface AuthFormProps {
    view: "login" | "signup";
}

export default function AuthForm({ view }: AuthFormProps) {
    const { signInWithPassword, signUp } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (view === "signup") {
                const { error } = await signUp(email, password);
                if (error) throw error;
                // Auto login or redirect?
                router.push("/onboarding");
            } else {
                const { error, data } = await signInWithPassword(email, password);
                if (error) throw error;
                if (data.user) {
                    // Check if wallet exists? Handled in dashboard
                    router.push("/dashboard");
                }
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-6">
            <div className="flex justify-center mb-8">
                <Link href="/">
                    <Image src="/logo.png" alt="Logo" width={60} height={60} className="hover:scale-105 transition-transform" />
                </Link>
            </div>

            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 shadow-xl">
                <h2 className="text-2xl font-bold text-center mb-6 text-white">
                    {view === "login" ? "Welcome Back" : "Create Account"}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1 ml-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00de00]/50 transition-colors"
                            placeholder="name@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1 ml-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00de00]/50 transition-colors"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="text-red-400 text-sm text-center bg-red-400/10 py-2 rounded-lg">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#00de00] text-black font-bold text-lg py-3 rounded-xl hover:bg-[#00ff00] transition-colors shadow-[0_0_20px_rgba(0,222,0,0.2)] disabled:opacity-50"
                    >
                        {loading ? "Processing..." : (view === "login" ? "Login" : "Sign Up")}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-400">
                    {view === "login" ? (
                        <>
                            Don't have an account?{" "}
                            <Link href="/signup" className="text-[#00de00] hover:underline">
                                Sign Up
                            </Link>
                        </>
                    ) : (
                        <>
                            Already have an account?{" "}
                            <Link href="/login" className="text-[#00de00] hover:underline">
                                Login
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

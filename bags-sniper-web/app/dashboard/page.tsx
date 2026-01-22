"use client";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Plus, Trash2, LogOut, Activity, Copy, Check, Wallet, X, Settings, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
    registerUser,
    getUserSettings,
    saveUserSettings,
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    getSniperStatus,
    startSniper,
    stopSniper,
    getActivityLogs,
    logActivity,
    type WatchlistItem,
    type ActivityLog,
} from "@/lib/supabase";

interface TokenStats {
    priceUsd: string;
    marketCap: number;
    change24h: number;
}

export default function DashboardPage() {
    const { user, signOut, loading: authLoading } = useAuth();
    const router = useRouter();
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [newMint, setNewMint] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [copied, setCopied] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [showDeposit, setShowDeposit] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [buyAmount, setBuyAmount] = useState("0.1");
    const [validationError, setValidationError] = useState<string | null>(null);
    const [tokenStats, setTokenStats] = useState<Record<string, TokenStats>>({});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasKey, setHasKey] = useState(false);
    const [keySetupMessage, setKeySetupMessage] = useState<string | null>(null);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);

    // Settings
    const [slippage, setSlippage] = useState("15");
    const [priorityFee, setPriorityFee] = useState("0.0001");
    const [bribe, setBribe] = useState("0.0001");
    const [telegramUserId, setTelegramUserId] = useState("");

    // Update Wallet State
    const [updateWalletAddress, setUpdateWalletAddress] = useState("");
    const [updatePrivateKey, setUpdatePrivateKey] = useState("");
    const [isUpdatingWallet, setIsUpdatingWallet] = useState(false);
    const [showUpdateWallet, setShowUpdateWallet] = useState(false);

    const depositRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);

    const logout = async () => {
        await signOut();
    };

    // Initial setup - register user and load data
    useEffect(() => {
        if (watchlist.length > 0) {
            const mints = watchlist.map(w => w.mint_address);
            fetchTokenStats(mints);
            const interval = setInterval(() => fetchTokenStats(mints), 15000); // Update every 15s
            return () => clearInterval(interval);
        }
    }, [watchlist]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
            return;
        }

        if (user && !walletAddress) {
            // Fetch wallet address from DB - STRICTLY filter by authenticated user's ID
            // No fallback to "most recent" - each user must have their own wallet
            supabase
                .from("users")
                .select("wallet_address, encrypted_private_key")
                .eq("privy_user_id", user.id)
                .maybeSingle()
                .then(async ({ data, error }) => {
                    if (data) {
                        setWalletAddress(data.wallet_address);
                        setHasKey(!!data.encrypted_private_key);
                        initializeUser(data.wallet_address);
                    } else {
                        // No wallet linked to this auth user - redirect to onboarding
                        router.push("/onboarding");
                    }
                });
        }
        setLoading(false);
    }, [authLoading, user, router]);

    const initializeUser = async (address: string) => {
        setLoading(true);
        try {
            await Promise.all([
                loadSettings(address),
                loadWatchlist(address),
                loadSniperStatus(address),
                loadLogs(address),
                fetchBalance(address),
            ]);
        } catch (e) {
            console.error("Failed to initialize:", e);
        }
        setLoading(false);
    };



    const handleUpdateWallet = async () => {
        if (!updateWalletAddress || !updatePrivateKey) {
            setKeySetupMessage("Please fill in both address and key");
            return;
        }

        // Basic validation
        if (updatePrivateKey.length < 50 && !updatePrivateKey.includes("[")) {
            setKeySetupMessage("Invalid private key format");
            return;
        }

        setIsUpdatingWallet(true);
        try {
            // 1. Delete existing user row for this auth user (ensures no orphaned wallets)
            await supabase
                .from("users")
                .delete()
                .eq("privy_user_id", user?.id);

            // 2. Insert new user row with the new wallet
            const { error: userError } = await supabase
                .from("users")
                .insert({
                    wallet_address: updateWalletAddress,
                    encrypted_private_key: updatePrivateKey,
                    privy_user_id: user?.id,
                });

            if (userError) throw userError;

            // 2. Create settings for new user (copy current if possible, but defaults are safer for clean slate)
            await supabase
                .from("user_settings")
                .upsert({
                    wallet_address: updateWalletAddress,
                    telegram_user_id: telegramUserId || null
                }, { onConflict: "wallet_address" });

            // 3. Create sniper status
            await supabase
                .from("sniper_status")
                .upsert({ wallet_address: updateWalletAddress, is_running: false }, { onConflict: "wallet_address" });

            // 4. Update local state
            setWalletAddress(updateWalletAddress);
            setHasKey(true);
            setKeySetupMessage(null);
            setShowUpdateWallet(false);

            // Clear inputs
            setUpdateWalletAddress("");
            setUpdatePrivateKey("");

            // Reload user data
            initializeUser(updateWalletAddress);

            alert("Wallet updated successfully! The sniper will now use this wallet.");

        } catch (e: any) {
            console.error("Update wallet error:", e);
            setKeySetupMessage(`Error: ${e.message}`);
        } finally {
            setIsUpdatingWallet(false);
        }
    };

    const loadSettings = async (address: string) => {
        const settings = await getUserSettings(address);
        if (settings) {
            setSlippage(settings.slippage.toString());
            setPriorityFee(settings.priority_fee.toString());
            setBribe(settings.bribe.toString());
            setTelegramUserId(settings.telegram_user_id || "");
        }
    };

    const loadWatchlist = async (address: string) => {
        const list = await getWatchlist(address);
        setWatchlist(list);
    };

    const loadSniperStatus = async (address: string) => {
        const status = await getSniperStatus(address);
        if (status) {
            setIsRunning(status.is_running);
        }
    };



    const fetchTokenStats = async (mints: string[]) => {
        if (mints.length === 0) return;
        try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`);
            const data = await res.json();

            const newStats: Record<string, TokenStats> = {};
            if (data.pairs) {
                data.pairs.forEach((pair: any) => {
                    const mint = pair.baseToken.address;
                    // Prefer pairs with highest liquidity if multiple exist, or just take the first one for now
                    if (!newStats[mint] || pair.liquidity?.usd > (newStats[mint] as any)?.liquidity) {
                        newStats[mint] = {
                            priceUsd: pair.priceUsd,
                            marketCap: pair.marketCap || pair.fdv,
                            change24h: pair.priceChange?.h24 || 0
                        };
                    }
                });
            }
            setTokenStats(prev => ({ ...prev, ...newStats }));
        } catch (e) {
            console.error("Failed to fetch token stats:", e);
        }
    };

    const loadLogs = async (address: string) => {
        const activityLogs = await getActivityLogs(address, 50);
        setLogs(activityLogs);
    };

    const handleSaveSettings = async () => {
        if (!walletAddress) return;
        setSaving(true);
        try {
            await saveUserSettings({
                wallet_address: walletAddress,
                slippage: parseFloat(slippage) || 15,
                priority_fee: parseFloat(priorityFee) || 0.0001,
                bribe: parseFloat(bribe) || 0.0001,
                telegram_user_id: telegramUserId.trim() || null,
            });
            setShowSettings(false);
            await logActivity(walletAddress, "SUCCESS", "Settings saved!");
            await loadLogs(walletAddress);
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
        setSaving(false);
    };

    const fetchBalance = useCallback(async (address: string) => {
        try {
            const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=132e0df7-690c-40bb-a9d9-3d4ff4915d07";
            const res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getBalance",
                    params: [address],
                }),
            });
            const data = await res.json();
            if (data.result?.value !== undefined) {
                setSolBalance(data.result.value / 1e9);
            }
        } catch (e) {
            console.error("Failed to fetch balance", e);
        }
    }, []);

    // Refresh balance every 10 seconds
    useEffect(() => {
        if (!walletAddress) return;
        fetchBalance(walletAddress); // Fetch immediately
        const interval = setInterval(() => fetchBalance(walletAddress), 10000);
        return () => clearInterval(interval);
    }, [fetchBalance, walletAddress]);

    // Refresh logs every 5 seconds when running
    useEffect(() => {
        if (isRunning && walletAddress) {
            const interval = setInterval(() => loadLogs(walletAddress), 5000);
            return () => clearInterval(interval);
        }
    }, [isRunning, walletAddress]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (depositRef.current && !depositRef.current.contains(event.target as Node)) {
                setShowDeposit(false);
            }
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setShowSettings(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const validateBagsAddress = (address: string): string | null => {
        const trimmed = address.trim();
        if (trimmed.length < 40 || trimmed.length > 50) {
            return "Invalid address length. Solana addresses are ~44 characters.";
        }
        if (!trimmed.endsWith("BAGS")) {
            return "Only Bags token addresses are allowed (must end with BAGS).";
        }
        return null;
    };

    const handleOpenAddModal = () => {
        const error = validateBagsAddress(newMint);
        if (error) {
            setValidationError(error);
            return;
        }
        setValidationError(null);
        setShowAddModal(true);
    };

    const handleAdd = async () => {
        if (!newMint.trim() || !walletAddress) return;
        const amount = parseFloat(buyAmount);
        if (isNaN(amount) || amount <= 0) {
            setValidationError("Please enter a valid buy amount.");
            return;
        }
        setSaving(true);
        try {
            await addToWatchlist(walletAddress, newMint.trim(), amount);
            await loadWatchlist(walletAddress);
            await loadLogs(walletAddress);
            setNewMint("");
            setBuyAmount("0.1");
            setShowAddModal(false);
        } catch (e) {
            console.error("Error adding to watchlist:", e);
        }
        setSaving(false);
    };

    const handleRemove = async (mint: string) => {
        if (!walletAddress) return;
        try {
            await removeFromWatchlist(walletAddress, mint);
            await loadWatchlist(walletAddress);
            await loadLogs(walletAddress);
        } catch (e) {
            console.error("Error removing:", e);
        }
    };

    const handleToggle = async () => {
        if (!walletAddress) return;
        setSaving(true);
        setKeySetupMessage(null);

        try {
            if (isRunning) {
                // Stop sniper
                await stopSniper(walletAddress);
                setIsRunning(false);
                await loadLogs(walletAddress);
            } else {
                // Check if we have the private key saved
                if (!hasKey) {
                    // Mark trading as enabled
                    // Note: For now we just start monitoring. Trading requires wallet setup.
                    setHasKey(true);
                    setKeySetupMessage(null);

                    // Update DB to indicate trading is enabled
                    await supabase
                        .from("users")
                        .update({ encrypted_private_key: "privy_managed" })
                        .eq("wallet_address", walletAddress);
                }

                // Start sniper
                await startSniper(walletAddress);
                setIsRunning(true);
                await loadLogs(walletAddress);
            }
        } catch (e) {
            console.error("Error toggling sniper:", e);
        }
        setSaving(false);
    };

    const copyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const formatLogTime = (timestamp: string) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    if (authLoading) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <RefreshCw className="animate-spin text-[#00de00]" />
                    <span>Loading Auth...</span>
                </div>
            </main>
        );
    }

    if (!user) {
        return null;
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <RefreshCw className="animate-spin text-[#00de00]" />
                    <span>Loading...</span>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-black">
            {/* Add Token Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-lg">Add to Watchlist</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="mb-4">
                            <label className="text-sm text-gray-400 mb-2 block">Token Address</label>
                            <div className="bg-black border border-white/10 rounded-lg px-4 py-3 font-mono text-sm text-[#00de00] break-all">
                                {newMint}
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="text-sm text-gray-400 mb-2 block">Buy Amount (SOL)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={buyAmount}
                                onChange={(e) => setBuyAmount(e.target.value)}
                                className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00de00]/50"
                                placeholder="0.1"
                            />
                            <p className="text-xs text-gray-500 mt-2">Amount of SOL to spend when sniping this token.</p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-3 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={saving}
                                className="flex-1 py-3 bg-[#00de00] text-black font-bold rounded-lg hover:bg-[#00ff00] transition-colors disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Add & Watch"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="border-b border-white/10 bg-black/50 backdrop-blur sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="Logo" width={40} height={40} />
                        <span className="font-bold text-lg">Bags Sniper</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* SOL Balance with Deposit Popup */}
                        <div className="relative" ref={depositRef}>
                            <button
                                onClick={() => setShowDeposit(!showDeposit)}
                                className="flex items-center gap-2 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-1.5 hover:border-[#00de00]/50 transition-colors cursor-pointer"
                            >
                                <Wallet size={16} className="text-[#00de00]" />
                                <span className="text-[#00de00] font-bold">
                                    {solBalance !== null ? solBalance.toFixed(4) : "---"} SOL
                                </span>
                            </button>

                            {showDeposit && (
                                <div className="absolute right-0 top-full mt-2 w-80 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 shadow-xl z-50">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Wallet className="text-[#00de00]" size={18} />
                                        <h3 className="font-semibold">Deposit SOL</h3>
                                    </div>
                                    <p className="text-gray-500 text-xs mb-4">
                                        Send SOL to fund your snipes. Only deposit via Solana network.
                                    </p>

                                    <div className="flex justify-center mb-4">
                                        <div className="bg-white p-2 rounded-lg">
                                            <QRCodeSVG value={walletAddress || ""} size={100} />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-[#00de00] truncate">
                                            {walletAddress}
                                        </div>
                                        <button
                                            onClick={copyAddress}
                                            className="p-2 bg-[#00de00] text-black rounded-lg hover:bg-[#00ff00] transition-colors"
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Balance:</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white">
                                                {solBalance !== null ? solBalance.toFixed(4) : "---"} SOL
                                            </span>
                                            <button onClick={() => walletAddress && fetchBalance(walletAddress)} className="text-xs text-[#00de00] hover:underline">↻</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Settings */}
                        <div className="relative" ref={settingsRef}>
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="text-gray-400 hover:text-white p-2"
                            >
                                <Settings size={20} />
                            </button>

                            {showSettings && (
                                <div className="absolute right-0 top-full mt-2 w-80 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 shadow-xl z-50">
                                    <h3 className="font-semibold mb-4">Trading Settings</h3>

                                    <div className="grid grid-cols-3 gap-3 mb-4">
                                        <div className="bg-black border border-white/10 rounded-lg p-3 text-center">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={slippage}
                                                onChange={(e) => setSlippage(e.target.value)}
                                                className="w-full bg-transparent text-center text-lg font-bold text-white focus:outline-none"
                                            />
                                            <div className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
                                                <span>%</span>
                                                <span>SLIPPAGE</span>
                                            </div>
                                        </div>

                                        <div className="bg-black border border-white/10 rounded-lg p-3 text-center">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={priorityFee}
                                                onChange={(e) => setPriorityFee(e.target.value)}
                                                className="w-full bg-transparent text-center text-lg font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <div className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
                                                <span>⚡</span>
                                                <span>PRIORITY</span>
                                            </div>
                                        </div>

                                        <div className="bg-black border border-white/10 rounded-lg p-3 text-center">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={bribe}
                                                onChange={(e) => setBribe(e.target.value)}
                                                className="w-full bg-transparent text-center text-lg font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <div className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
                                                <span>💰</span>
                                                <span>BRIBE</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Telegram Notifications */}
                                    <div className="mb-4 border-t border-white/10 pt-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-lg">📢</span>
                                            <h4 className="font-semibold text-sm">Telegram Notifications</h4>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-2">
                                            Get notified when your snipes execute. First, start <a href="https://t.me/JewishBAGS_Bot" target="_blank" rel="noopener noreferrer" className="text-[#00de00] hover:underline">@JewishBAGS_Bot</a> on Telegram, then enter your user ID below.
                                        </p>
                                        <input
                                            type="text"
                                            value={telegramUserId}
                                            onChange={(e) => setTelegramUserId(e.target.value)}
                                            placeholder="Your Telegram User ID (numeric)"
                                            className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00de00]/50"
                                        />
                                        <p className="text-xs text-gray-600 mt-1">
                                            💡 Send /start to @JewishBAGS_Bot to get your User ID
                                        </p>
                                    </div>

                                    {/* Update Wallet Connection */}
                                    <div className="mb-4 border-t border-white/10 pt-4">
                                        <div
                                            className="flex items-center justify-between mb-2 cursor-pointer hover:bg-white/5 p-1 rounded"
                                            onClick={() => setShowUpdateWallet(!showUpdateWallet)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">🔑</span>
                                                <h4 className="font-semibold text-sm">Update Wallet Connection</h4>
                                            </div>
                                            <span className="text-xs text-gray-500">{showUpdateWallet ? "▼" : "▶"}</span>
                                        </div>

                                        {showUpdateWallet && (
                                            <div className="space-y-3 p-3 bg-red-900/10 border border-red-500/20 rounded-lg">
                                                <p className="text-xs text-red-400 font-bold">
                                                    ⚠️ Warning: This will replace your current sniper wallet.
                                                </p>
                                                <input
                                                    type="text"
                                                    value={updateWalletAddress}
                                                    onChange={(e) => setUpdateWalletAddress(e.target.value)}
                                                    placeholder="New Wallet Address"
                                                    className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00de00]/50 font-mono"
                                                    autoComplete="off"
                                                />
                                                <input
                                                    type="password"
                                                    value={updatePrivateKey}
                                                    onChange={(e) => setUpdatePrivateKey(e.target.value)}
                                                    placeholder="New Private Key (Base58)"
                                                    className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00de00]/50 font-mono"
                                                    autoComplete="new-password"
                                                />
                                                <button
                                                    onClick={handleUpdateWallet}
                                                    disabled={isUpdatingWallet}
                                                    className="w-full py-2 bg-red-600/20 text-red-400 border border-red-500/50 font-bold rounded-lg hover:bg-red-600/30 transition-colors text-xs"
                                                >
                                                    {isUpdatingWallet ? "Updating..." : "CONFIRM NEW WALLET"}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleSaveSettings}
                                        disabled={saving}
                                        className="w-full py-2 bg-[#00de00] text-black font-bold rounded-lg hover:bg-[#00ff00] transition-colors text-sm disabled:opacity-50"
                                    >
                                        {saving ? "Saving..." : "Save Settings"}
                                    </button>
                                </div>
                            )}
                        </div>

                        <span className="text-sm text-gray-500 font-mono">
                            {walletAddress?.slice(0, 4)}...{walletAddress?.slice(-4)}
                        </span>
                        <button onClick={logout} className="text-gray-400 hover:text-white">
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Status Bar */}
                <div className="flex items-center justify-between mb-8 p-4 bg-[#0a0a0a] rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                        <Activity className={isRunning ? "text-[#00de00]" : "text-gray-500"} />
                        <div>
                            <div className="font-semibold">
                                Status: <span className={isRunning ? "text-[#00de00]" : "text-red-400"}>{isRunning ? "RUNNING" : "STOPPED"}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                                {keySetupMessage ? (
                                    <span className="text-yellow-400">{keySetupMessage}</span>
                                ) : isRunning ? (
                                    "Monitoring Bags.fm claims..."
                                ) : (
                                    "Click Start to begin monitoring"
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleToggle}
                        disabled={saving}
                        className={`${isRunning ? "btn-outline" : "btn-primary"} disabled:opacity-50`}
                    >
                        {saving ? "..." : isRunning ? "Stop" : "Start Sniper"}
                    </button>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Watchlist */}
                    <div className="lg:col-span-2 bg-[#0a0a0a] rounded-xl border border-white/10 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="font-semibold text-lg">Watchlist</h2>
                            <span className="text-xs text-gray-500">{watchlist.length} tokens</span>
                        </div>

                        {/* Add Token */}
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                placeholder="Enter Bags token address (ends with BAGS)..."
                                value={newMint}
                                onChange={(e) => {
                                    setNewMint(e.target.value);
                                    setValidationError(null);
                                }}
                                className="flex-1 bg-black border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#00de00]/50"
                            />
                            <button onClick={handleOpenAddModal} className="btn-primary px-4">
                                <Plus size={20} />
                            </button>
                        </div>
                        {validationError && (
                            <p className="text-red-400 text-xs mb-4">{validationError}</p>
                        )}

                        {/* Table */}
                        <div className="overflow-x-auto mt-4">
                            <table className="w-full table-bags">
                                <thead>
                                    <tr className="text-left">
                                        <th className="pb-3">#</th>
                                        <th className="pb-3 text-xs font-semibold text-gray-500">MINT</th>
                                        <th className="pb-3 text-xs font-semibold text-gray-500">PRICE / MC</th>
                                        <th className="pb-3 text-xs font-semibold text-gray-500">AMOUNT</th>
                                        <th className="pb-3 text-xs font-semibold text-gray-500">STATUS</th>
                                        <th className="pb-3"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {watchlist.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-gray-500">
                                                No tokens in watchlist. Add one above.
                                            </td>
                                        </tr>
                                    ) : (
                                        watchlist.map((item, i) => (
                                            <tr key={item.id}>
                                                <td className="py-3 text-gray-500">{i + 1}</td>
                                                <td className="py-3 font-mono text-sm">
                                                    {item.mint_address.slice(0, 4)}...{item.mint_address.slice(-4)}
                                                </td>
                                                <td className="py-3 font-mono text-sm">
                                                    {tokenStats[item.mint_address] ? (
                                                        <div className="flex flex-col">
                                                            <span className="text-white">${parseFloat(tokenStats[item.mint_address].priceUsd).toFixed(6)}</span>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className="text-gray-500">MC: ${(tokenStats[item.mint_address].marketCap / 1000).toFixed(1)}k</span>
                                                                <span className={tokenStats[item.mint_address].change24h >= 0 ? "text-[#00de00]" : "text-red-400"}>
                                                                    {tokenStats[item.mint_address].change24h >= 0 ? "↗" : "↘"} {Math.abs(tokenStats[item.mint_address].change24h).toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-600 text-xs">Loading...</span>
                                                    )}
                                                </td>
                                                <td className="py-3 text-[#00de00] font-mono">
                                                    {item.buy_amount} SOL
                                                </td>
                                                <td className="py-3">
                                                    {item.sniped ? (
                                                        <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded">
                                                            Sniped
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-1 bg-[#00de00]/10 text-[#00de00] rounded">
                                                            Watching
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    <button
                                                        onClick={() => handleRemove(item.mint_address)}
                                                        className="text-red-400 hover:text-red-300"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Logs */}
                    <div className="bg-[#0a0a0a] rounded-xl border border-white/10 p-6 h-[500px] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold">Activity Logs</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={() => walletAddress && loadLogs(walletAddress)} className="text-gray-400 hover:text-white">
                                    <RefreshCw size={14} />
                                </button>
                                {isRunning && <span className="text-xs text-[#00de00] animate-pulse">● Live</span>}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-black rounded-lg p-3 font-mono text-xs space-y-1">
                            {logs.length === 0 ? (
                                <div className="text-gray-500 text-center py-4">No activity yet</div>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className="text-gray-400">
                                        <span className="text-gray-600">[{formatLogTime(log.created_at)}]</span>
                                        <span className={
                                            log.log_type === "SUCCESS" ? "text-[#00de00]" :
                                                log.log_type === "ERROR" ? "text-red-400" :
                                                    log.log_type === "WARNING" ? "text-yellow-400" :
                                                        "text-gray-300"
                                        }> {log.message}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

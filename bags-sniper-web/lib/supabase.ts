import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// TYPES
// ==========================================

export interface User {
    id: string;
    wallet_address: string;
    privy_user_id: string | null;
    is_active: boolean;
    created_at: string;
}

export interface UserSettings {
    wallet_address: string;
    slippage: number;
    priority_fee: number;
    bribe: number;
    auto_sell: boolean;
    auto_sell_multiplier: number;
    max_buy_per_token: number;
    telegram_user_id: string | null;
}

export interface WatchlistItem {
    id: string;
    wallet_address: string;
    mint_address: string;
    buy_amount: number;
    is_active: boolean;
    sniped: boolean;
    sniped_at: string | null;
    created_at: string;
}

export interface TradeLog {
    id: string;
    wallet_address: string;
    mint_address: string;
    action: "BUY" | "SELL" | "FAILED";
    amount_sol: number;
    amount_tokens: number;
    price_per_token: number;
    tx_signature: string | null;
    status: "pending" | "confirmed" | "failed";
    error_message: string | null;
    created_at: string;
}

export interface ActivityLog {
    id: string;
    wallet_address: string;
    log_type: "INFO" | "WARNING" | "ERROR" | "SUCCESS";
    message: string;
    metadata: any;
    created_at: string;
}

export interface SniperStatus {
    wallet_address: string;
    is_running: boolean;
    started_at: string | null;
    stopped_at: string | null;
    last_heartbeat: string;
}

// ==========================================
// USER FUNCTIONS
// ==========================================

export async function registerUser(walletAddress: string, privyUserId?: string): Promise<User | null> {
    // First upsert the user
    const { data: userData, error: userError } = await supabase
        .from("users")
        .upsert({
            wallet_address: walletAddress,
            privy_user_id: privyUserId || null,
        }, { onConflict: "wallet_address" })
        .select()
        .single();

    if (userError) {
        console.error("Error registering user:", userError);
        return null;
    }

    // Create default settings if not exists
    await supabase
        .from("user_settings")
        .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" });

    // Create sniper status if not exists
    await supabase
        .from("sniper_status")
        .upsert({ wallet_address: walletAddress, is_running: false }, { onConflict: "wallet_address" });

    return userData;
}

export async function getUser(walletAddress: string): Promise<User | null> {
    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("Error fetching user:", error);
    }
    return data;
}

// ==========================================
// SETTINGS FUNCTIONS
// ==========================================

export async function getUserSettings(walletAddress: string): Promise<UserSettings | null> {
    const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("Error fetching settings:", error);
    }
    return data;
}

export async function saveUserSettings(settings: Partial<UserSettings> & { wallet_address: string }): Promise<void> {
    const { error } = await supabase
        .from("user_settings")
        .upsert(settings, { onConflict: "wallet_address" });

    if (error) {
        console.error("Error saving settings:", error);
        throw error;
    }
}

// ==========================================
// WATCHLIST FUNCTIONS
// ==========================================

export async function getWatchlist(walletAddress: string): Promise<WatchlistItem[]> {
    const { data, error } = await supabase
        .from("watchlist")
        .select("*")
        .eq("wallet_address", walletAddress)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching watchlist:", error);
        return [];
    }
    return data || [];
}

export async function addToWatchlist(walletAddress: string, mintAddress: string, buyAmount: number): Promise<WatchlistItem | null> {
    const { data, error } = await supabase
        .from("watchlist")
        .upsert({
            wallet_address: walletAddress,
            mint_address: mintAddress,
            buy_amount: buyAmount,
            is_active: true,
        }, { onConflict: "wallet_address,mint_address" })
        .select()
        .single();

    if (error) {
        console.error("Error adding to watchlist:", error);
        throw error;
    }

    // Log activity
    await logActivity(walletAddress, "INFO", `Added ${mintAddress.slice(0, 8)}... to watchlist with ${buyAmount} SOL`);

    return data;
}

export async function removeFromWatchlist(walletAddress: string, mintAddress: string): Promise<void> {
    const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("wallet_address", walletAddress)
        .eq("mint_address", mintAddress);

    if (error) {
        console.error("Error removing from watchlist:", error);
        throw error;
    }

    // Log activity
    await logActivity(walletAddress, "INFO", `Removed ${mintAddress.slice(0, 8)}... from watchlist`);
}

// ==========================================
// SNIPER STATUS FUNCTIONS
// ==========================================

export async function getSniperStatus(walletAddress: string): Promise<SniperStatus | null> {
    const { data, error } = await supabase
        .from("sniper_status")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("Error fetching sniper status:", error);
    }
    return data;
}

export async function startSniper(walletAddress: string): Promise<void> {
    const { error } = await supabase
        .from("sniper_status")
        .upsert({
            wallet_address: walletAddress,
            is_running: true,
            started_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString(),
        }, { onConflict: "wallet_address" });

    if (error) {
        console.error("Error starting sniper:", error);
        throw error;
    }

    await logActivity(walletAddress, "SUCCESS", "Sniper started - monitoring for claims...");
}

export async function stopSniper(walletAddress: string): Promise<void> {
    const { error } = await supabase
        .from("sniper_status")
        .update({
            is_running: false,
            stopped_at: new Date().toISOString(),
        })
        .eq("wallet_address", walletAddress);

    if (error) {
        console.error("Error stopping sniper:", error);
        throw error;
    }

    await logActivity(walletAddress, "INFO", "Sniper stopped");
}

export async function updateSniperHeartbeat(walletAddress: string): Promise<void> {
    await supabase
        .from("sniper_status")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("wallet_address", walletAddress);
}

// ==========================================
// TRADE LOG FUNCTIONS
// ==========================================

export async function getTradeLogs(walletAddress: string, limit: number = 50): Promise<TradeLog[]> {
    const { data, error } = await supabase
        .from("trade_logs")
        .select("*")
        .eq("wallet_address", walletAddress)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching trade logs:", error);
        return [];
    }
    return data || [];
}

export async function logTrade(trade: Omit<TradeLog, "id" | "created_at">): Promise<void> {
    const { error } = await supabase
        .from("trade_logs")
        .insert(trade);

    if (error) {
        console.error("Error logging trade:", error);
    }
}

// ==========================================
// ACTIVITY LOG FUNCTIONS
// ==========================================

export async function getActivityLogs(walletAddress: string, limit: number = 50): Promise<ActivityLog[]> {
    // 1. Fetch generic activity logs
    const { data: activities, error: activityError } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("wallet_address", walletAddress)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (activityError) {
        console.error("Error fetching activity logs:", activityError);
        return [];
    }

    // 2. Fetch trade logs (success/fail)
    const { data: trades, error: tradeError } = await supabase
        .from("trade_logs")
        .select("*")
        .eq("wallet_address", walletAddress)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (tradeError) {
        console.error("Error fetching trade logs:", tradeError);
        return activities || [];
    }

    // 3. Convert trade logs to activity format
    const tradeActivities: ActivityLog[] = (trades || []).map((trade: any) => ({
        id: `trade-${trade.id}`,
        wallet_address: trade.wallet_address,
        log_type: trade.status === "SUCCESS" ? "SUCCESS" : "ERROR",
        message: trade.status === "SUCCESS"
            ? `Bought ${trade.amount_sol} SOL of ${trade.mint_address.slice(0, 8)}...`
            : `Trade Failed: ${trade.error || "Unknown error"} (${trade.mint_address.slice(0, 8)}...)`,
        created_at: trade.created_at,
        metadata: null
    }));

    // 4. Merge and sort
    const allLogs = [...(activities || []), ...tradeActivities];

    // Sort descending by date
    return allLogs.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, limit);
}

export async function logActivity(
    walletAddress: string,
    logType: "INFO" | "WARNING" | "ERROR" | "SUCCESS",
    message: string,
    metadata?: any
): Promise<void> {
    const { error } = await supabase
        .from("activity_logs")
        .insert({
            wallet_address: walletAddress,
            log_type: logType,
            message,
            metadata: metadata || null,
        });

    if (error) {
        console.error("Error logging activity:", error);
    }
}

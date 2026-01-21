-- ==========================================
-- BAGS SNIPER - FULL DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ==========================================

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS trade_logs CASCADE;
DROP TABLE IF EXISTS sniper_status CASCADE;
DROP TABLE IF EXISTS watchlist CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE NOT NULL,
    privy_user_id TEXT,
    encrypted_private_key TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. USER SETTINGS TABLE
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE NOT NULL,
    slippage DECIMAL(5, 2) DEFAULT 15.0,
    priority_fee DECIMAL(10, 6) DEFAULT 0.0001,
    bribe DECIMAL(10, 6) DEFAULT 0.0001,
    auto_sell BOOLEAN DEFAULT false,
    auto_sell_multiplier DECIMAL(5, 2) DEFAULT 2.0,
    max_buy_per_token DECIMAL(18, 9) DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. WATCHLIST TABLE
CREATE TABLE watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    mint_address TEXT NOT NULL,
    buy_amount DECIMAL(18, 9) DEFAULT 0.1,
    is_active BOOLEAN DEFAULT true,
    sniped BOOLEAN DEFAULT false,
    sniped_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_address, mint_address)
);

-- 4. TRADE LOGS TABLE
CREATE TABLE trade_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    mint_address TEXT NOT NULL,
    action TEXT NOT NULL,
    amount_sol DECIMAL(18, 9),
    amount_tokens DECIMAL(18, 9),
    price_per_token DECIMAL(18, 12),
    tx_signature TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    priority_fee_used DECIMAL(10, 6),
    bribe_used DECIMAL(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. SNIPER STATUS TABLE
CREATE TABLE sniper_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE NOT NULL,
    is_running BOOLEAN DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ACTIVITY LOGS TABLE
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    log_type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ENABLE ROW LEVEL SECURITY
-- ==========================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sniper_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS POLICIES (Allow all for now)
-- ==========================================
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all on user_settings" ON user_settings FOR ALL USING (true);
CREATE POLICY "Allow all on watchlist" ON watchlist FOR ALL USING (true);
CREATE POLICY "Allow all on trade_logs" ON trade_logs FOR ALL USING (true);
CREATE POLICY "Allow all on sniper_status" ON sniper_status FOR ALL USING (true);
CREATE POLICY "Allow all on activity_logs" ON activity_logs FOR ALL USING (true);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_user_settings_wallet ON user_settings(wallet_address);
CREATE INDEX idx_watchlist_wallet ON watchlist(wallet_address);
CREATE INDEX idx_watchlist_mint ON watchlist(mint_address);
CREATE INDEX idx_trade_logs_wallet ON trade_logs(wallet_address);
CREATE INDEX idx_trade_logs_created ON trade_logs(created_at DESC);
CREATE INDEX idx_activity_logs_wallet ON activity_logs(wallet_address);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX idx_sniper_status_running ON sniper_status(is_running);

-- ==========================================
-- AUTO-UPDATE TIMESTAMP
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

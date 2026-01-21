-- User Settings Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE NOT NULL,
    slippage DECIMAL(5, 2) DEFAULT 15.0,
    priority_fee DECIMAL(10, 6) DEFAULT 0.0001,
    bribe DECIMAL(10, 6) DEFAULT 0.0001,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Watchlist Table with buy amounts
CREATE TABLE IF NOT EXISTS watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    mint_address TEXT NOT NULL,
    buy_amount DECIMAL(18, 9) DEFAULT 0.1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_address, mint_address)
);

-- Enable Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now, tighten in production)
CREATE POLICY "Allow all on user_settings" ON user_settings FOR ALL USING (true);
CREATE POLICY "Allow all on watchlist" ON watchlist FOR ALL USING (true);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for user_settings
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_wallet ON watchlist(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_settings_wallet ON user_settings(wallet_address);

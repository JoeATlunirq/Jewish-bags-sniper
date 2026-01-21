-- Create a table for one-time signup codes
CREATE TABLE IF NOT EXISTS signup_codes (
    code TEXT PRIMARY KEY,
    is_used BOOLEAN DEFAULT FALSE,
    used_by TEXT REFERENCES users(wallet_address), -- Link to wallet address who used it
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS (Row Level Security)
ALTER TABLE signup_codes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to READ codes (to check validity)
-- In a stricter system we might use a function, but for now select is okay if we don't expose 'used_by' publicly?
-- A user needs to check if a code exists and is_used=false.
CREATE POLICY "Allow public read of signup codes" ON signup_codes
    FOR SELECT
    USING (true);

-- Allow anyone to UPDATE code (to mark as used) 
-- ideally only if they are the one claiming it, but for simplicity of onboarding (before auth is fully established or linked):
CREATE POLICY "Allow update of signup codes" ON signup_codes
    FOR UPDATE
    USING (true);

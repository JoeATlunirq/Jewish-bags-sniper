-- Add Telegram user ID for notifications
-- Run this in Supabase SQL Editor

ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS telegram_user_id TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.telegram_user_id IS 'Telegram user ID (numeric) for receiving trade notifications. Users should start @JewishBAGS_Bot first.';

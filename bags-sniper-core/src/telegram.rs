//! Telegram Bot Notifications for Bags Sniper
//!
//! Sends real-time notifications to users when their snipes execute

use reqwest::Client;
use serde::Serialize;
use anyhow::Result;
use log::{info, error};
use std::time::Duration;

const TELEGRAM_BOT_TOKEN: &str = "8451637983:AAGVu132VI3vdgy_T_K8exCv7wpNb_5b6kA";

#[derive(Clone)]
pub struct TelegramNotifier {
    client: Client,
    bot_token: String,
}

#[derive(Serialize)]
struct SendMessageRequest<'a> {
    chat_id: &'a str,
    text: &'a str,
    parse_mode: &'a str,
}

impl TelegramNotifier {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("Failed to create HTTP client"),
            bot_token: TELEGRAM_BOT_TOKEN.to_string(),
        }
    }

    /// Send a notification to a user
    pub async fn send_notification(&self, telegram_user_id: &str, message: &str) -> Result<()> {
        if telegram_user_id.is_empty() {
            return Ok(()); // No Telegram ID configured
        }

        let url = format!(
            "https://api.telegram.org/bot{}/sendMessage",
            self.bot_token
        );

        let request = SendMessageRequest {
            chat_id: telegram_user_id,
            text: message,
            parse_mode: "HTML",
        };

        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        if response.status().is_success() {
            info!("📱 Telegram notification sent to {}", telegram_user_id);
        } else {
            let error_text = response.text().await.unwrap_or_default();
            error!("❌ Telegram API error: {}", error_text);
        }

        Ok(())
    }

    /// Send a trade success notification
    pub async fn notify_trade_success(
        &self,
        telegram_user_id: &str,
        mint: &str,
        amount_sol: f64,
        tx_signature: &str,
    ) -> Result<()> {
        let message = format!(
            "🎯 <b>BAGS SNIPER - TRADE EXECUTED!</b>\n\n\
            ✅ <b>Status:</b> SUCCESS\n\
            🪙 <b>Token:</b> <code>{}</code>\n\
            💰 <b>Amount:</b> {} SOL\n\n\
            🔗 <a href=\"https://solscan.io/tx/{}\">View Transaction</a>",
            mint,
            amount_sol,
            tx_signature
        );

        self.send_notification(telegram_user_id, &message).await
    }

    /// Send a trade failure notification
    pub async fn notify_trade_failed(
        &self,
        telegram_user_id: &str,
        mint: &str,
        amount_sol: f64,
        error: &str,
    ) -> Result<()> {
        let message = format!(
            "❌ <b>BAGS SNIPER - TRADE FAILED</b>\n\n\
            🪙 <b>Token:</b> <code>{}</code>\n\
            💰 <b>Amount:</b> {} SOL\n\
            ⚠️ <b>Error:</b> {}\n\n\
            Check your settings and try again.",
            mint,
            amount_sol,
            error
        );

        self.send_notification(telegram_user_id, &message).await
    }

    /// Send a claim detected notification
    pub async fn notify_claim_detected(
        &self,
        telegram_user_id: &str,
        mint: &str,
    ) -> Result<()> {
        let message = format!(
            "👀 <b>BAGS SNIPER - CLAIM DETECTED!</b>\n\n\
            🎯 Executing snipe for:\n\
            <code>{}</code>\n\n\
            ⏳ Processing...",
            mint
        );

        self.send_notification(telegram_user_id, &message).await
    }
}

impl Default for TelegramNotifier {
    fn default() -> Self {
        Self::new()
    }
}

//! Supabase Client for Bags Sniper
//!
//! Handles all database operations:
//! - Fetching active users (sniper_status.is_running = true)
//! - Getting user watchlists and settings
//! - Logging trades and activities
//! - Updating sniper status

use reqwest::Client;
use serde::Deserialize;
use anyhow::{anyhow, Result};

#[derive(Clone)]
pub struct SupabaseClient {
    client: Client,
    url: String,
    key: String,
}

#[derive(Debug, Deserialize)]
pub struct ActiveUser {
    pub wallet_address: String,
    pub is_running: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WatchlistItem {
    pub id: String,
    pub wallet_address: String,
    pub mint_address: String,
    pub buy_amount: f64,
    pub is_active: bool,
    pub sniped: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct UserSettings {
    pub wallet_address: String,
    pub slippage: f64,
    pub priority_fee: f64,
    pub bribe: f64,
    pub telegram_user_id: Option<String>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            wallet_address: String::new(),
            slippage: 15.0,
            priority_fee: 0.0001,
            bribe: 0.0001,
            telegram_user_id: None,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UserData {
    pub wallet_address: String,
    pub encrypted_private_key: Option<String>,
}

impl SupabaseClient {
    pub fn new(url: String, key: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to create HTTP client"),
            url,
            key,
        }
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}/rest/v1/{}", self.url, path)
    }

    fn auth_headers(&self) -> Vec<(&'static str, String)> {
        vec![
            ("apikey", self.key.clone()),
            ("Authorization", format!("Bearer {}", self.key)),
        ]
    }

    /// Get all users with is_running = true
    pub async fn get_active_users(&self) -> Result<Vec<ActiveUser>> {
        let url = format!("{}?is_running=eq.true&select=wallet_address,is_running", 
            self.api_url("sniper_status"));
        
        let mut req = self.client.get(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        let res = req.send().await?;
        
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Supabase error {}: {}", status, text));
        }
        
        let users: Vec<ActiveUser> = res.json().await?;
        Ok(users)
    }

    /// Get watchlist for a user
    pub async fn get_user_watchlist(&self, wallet: &str) -> Result<Vec<WatchlistItem>> {
        let url = format!(
            "{}?wallet_address=eq.{}&is_active=eq.true&select=*",
            self.api_url("watchlist"),
            wallet
        );
        
        let mut req = self.client.get(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        let res = req.send().await?;
        
        if !res.status().is_success() {
            return Err(anyhow!("Failed to get watchlist"));
        }
        
        let items: Vec<WatchlistItem> = res.json().await?;
        Ok(items)
    }

    /// Get user settings
    pub async fn get_user_settings(&self, wallet: &str) -> Result<UserSettings> {
        let url = format!(
            "{}?wallet_address=eq.{}&select=*",
            self.api_url("user_settings"),
            wallet
        );
        
        let mut req = self.client.get(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        let res = req.send().await?;
        
        if !res.status().is_success() {
            return Ok(UserSettings::default());
        }
        
        let settings: Vec<UserSettings> = res.json().await?;
        Ok(settings.into_iter().next().unwrap_or_default())
    }

    /// Get user's private key
    pub async fn get_user_private_key(&self, wallet: &str) -> Result<Option<String>> {
        let url = format!(
            "{}?wallet_address=eq.{}&select=wallet_address,encrypted_private_key",
            self.api_url("users"),
            wallet
        );
        
        let mut req = self.client.get(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        let res = req.send().await?;
        
        if !res.status().is_success() {
            return Err(anyhow!("Failed to get user data"));
        }
        
        let users: Vec<UserData> = res.json().await?;
        Ok(users.into_iter().next().and_then(|u| u.encrypted_private_key))
    }

    /// Mark a watchlist item as sniped
    pub async fn mark_as_sniped(&self, wallet: &str, mint: &str) -> Result<()> {
        let url = format!(
            "{}?wallet_address=eq.{}&mint_address=eq.{}",
            self.api_url("watchlist"),
            wallet,
            mint
        );
        
        let body = serde_json::json!({
            "sniped": true,
            "sniped_at": chrono::Utc::now().to_rfc3339()
        });
        
        let mut req = self.client.patch(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        let res = req
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        
        if !res.status().is_success() {
            return Err(anyhow!("Failed to mark as sniped"));
        }
        
        Ok(())
    }

    /// Log activity
    pub async fn log_activity(&self, wallet: &str, log_type: &str, message: &str) -> Result<()> {
        let url = self.api_url("activity_logs");
        
        let body = serde_json::json!({
            "wallet_address": wallet,
            "log_type": log_type,
            "message": message
        });
        
        let mut req = self.client.post(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        req.header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        
        Ok(())
    }

    /// Log trade
    pub async fn log_trade(
        &self,
        wallet: &str,
        mint: &str,
        action: &str,
        amount_sol: f64,
        signature: Option<&str>,
        status: &str,
        error: Option<&str>,
    ) -> Result<()> {
        let url = self.api_url("trade_logs");
        
        let body = serde_json::json!({
            "wallet_address": wallet,
            "mint_address": mint,
            "action": action,
            "amount_sol": amount_sol,
            "tx_signature": signature,
            "status": status,
            "error_message": error
        });
        
        let mut req = self.client.post(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        req.header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        
        Ok(())
    }

    /// Update user's heartbeat
    pub async fn update_heartbeat(&self, wallet: &str) -> Result<()> {
        let url = format!(
            "{}?wallet_address=eq.{}",
            self.api_url("sniper_status"),
            wallet
        );
        
        let body = serde_json::json!({
            "last_heartbeat": chrono::Utc::now().to_rfc3339()
        });
        
        let mut req = self.client.patch(&url);
        for (k, v) in self.auth_headers() {
            req = req.header(k, v);
        }
        
        req.header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;
        
        Ok(())
    }
}

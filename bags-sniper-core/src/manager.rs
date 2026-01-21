use crate::executor::TransactionExecutor;
use crate::telegram::TelegramNotifier;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use log::{info, error};
use anyhow::Result;
use std::collections::HashSet;

pub struct UserSniper {
    pub user_id: String,
    pub watchlist: HashMap<String, f64>, // mint -> buy_amount (SOL)
    pub creators: HashMap<String, String>, // mint -> creator_address
    pub settings: crate::supabase::UserSettings,
    pub executor: crate::executor::TransactionExecutor,
    pub private_key: String,
}

pub struct SniperManager {
    // Map user_id (wallet address) -> UserSniper
    users: Arc<Mutex<HashMap<String, UserSniper>>>,
    // Map vault/config account -> mint (for Strategy B)
    vault_to_mint: Arc<Mutex<HashMap<String, String>>>,
    // Idempotency: set of (user_id:mint) that were already sniped
    sniped: Arc<Mutex<HashSet<String>>>,
    rpc_url: String,
    supabase: Arc<crate::supabase::SupabaseClient>,
    jupiter: Option<Arc<crate::jupiter::JupiterClient>>,
    telegram: Arc<TelegramNotifier>,
}

impl SniperManager {
    pub fn new(rpc_url: String, supabase: Arc<crate::supabase::SupabaseClient>, jupiter: Option<Arc<crate::jupiter::JupiterClient>>) -> Self {
        Self {
            users: Arc::new(Mutex::new(HashMap::new())),
            vault_to_mint: Arc::new(Mutex::new(HashMap::new())),
            sniped: Arc::new(Mutex::new(HashSet::new())),
            rpc_url,
            supabase,
            jupiter,
            telegram: Arc::new(TelegramNotifier::new()),
        }
    }

    pub fn register_user(&self, user_id: String, private_key: String, settings: crate::supabase::UserSettings) {
        let mut users = self.users.lock().unwrap();
        let executor = TransactionExecutor::new(self.rpc_url.clone(), false); 
        let user_sniper = UserSniper {
            user_id: user_id.clone(),
            watchlist: HashMap::new(),
            creators: HashMap::new(),
            settings,
            private_key: private_key.clone(),
            executor,
        };
        users.insert(user_id.clone(), user_sniper);
        info!("Registered user: {}", user_id);
    }

    pub fn add_to_watchlist(&self, user_id: &String, mint: String, buy_amount: f64) -> Result<(), String> {
        let mut users = self.users.lock().unwrap();
        if let Some(user) = users.get_mut(user_id) {
            user.watchlist.insert(mint.clone(), buy_amount);
            info!("User {} added {} to watchlist ({} SOL)", user_id, mint, buy_amount);
            
            // ---------------------------------------------------------
            // 1. Fetch Creator Address (Async Background Task)
            // ---------------------------------------------------------
            let rpc_url = self.rpc_url.clone();
            let mint_clone = mint.clone();
            let users_clone = self.users.clone();
            let user_id_clone = user_id.clone();
            
            tokio::spawn(async move {
                use solana_client::rpc_client::RpcClient;
                use solana_sdk::pubkey::Pubkey;
                use std::str::FromStr;

                // Create a temporary RPC client for this fetch
                let client = RpcClient::new(rpc_url);
                if let Ok(mint_pk) = Pubkey::from_str(&mint_clone) {
                    info!("Fetching creator for mint: {}", mint_clone);
                    match crate::metadata::fetch_creator(&client, &mint_pk) {
                        Ok(creator) => {
                            info!("✅ Creator Fetched for {}: {}", mint_clone, creator);
                            let mut users_guard = users_clone.lock().unwrap();
                            if let Some(u) = users_guard.get_mut(&user_id_clone) {
                                u.creators.insert(mint_clone.clone(), creator.to_string());
                            }
                        },
                        Err(e) => {
                            error!("❌ Failed to fetch creator for {}: {}", mint_clone, e);
                            // Optional: Retry logic or default to secure mode
                        }
                    }
                }
            });

            // ---------------------------------------------------------
            // 2. Strategy B fallback: Derive Config PDAs for V1 and V2
            // ---------------------------------------------------------
            // Seeds: [b"fee_share_config", mint.key()]
            use solana_sdk::pubkey::Pubkey;
            use std::str::FromStr;
            
            if let Ok(mint_pk) = Pubkey::from_str(&mint) {
                let mut vault_map = self.vault_to_mint.lock().unwrap();
                
                // Derive for V2
                // Seeds: [b"fee_share_config", base_mint, quote_mint]
                if let Ok(p2) = Pubkey::from_str("FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK") {
                    if let Ok(wsol) = Pubkey::from_str("So11111111111111111111111111111111111111112") {
                        let (pda, _) = Pubkey::find_program_address(
                            &[b"fee_share_config", mint_pk.as_ref(), wsol.as_ref()], 
                            &p2
                        );
                        vault_map.insert(pda.to_string(), mint.clone());
                        info!("Strategy B (V2) Registered: {} -> {}", pda, mint);
                    }
                }
                
                // Derive for V1 (Official Legacy)
                // V1 usually only uses the mint seed
                if let Ok(p1) = Pubkey::from_str("FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi") {
                    let (pda, _) = Pubkey::find_program_address(&[b"fee_share_config", mint_pk.as_ref()], &p1);
                    vault_map.insert(pda.to_string(), mint.clone());
                    info!("Strategy B (V1) Registered: {} -> {}", pda, mint);
                }
            }
            Ok(())
        } else {
            Err("User not found".to_string())
        }
    }

    pub fn remove_from_watchlist(&self, user_id: &String, mint: &String) -> Result<(), String> {
        let mut users = self.users.lock().unwrap();
        if let Some(user) = users.get_mut(user_id) {
            user.watchlist.remove(mint);
            user.creators.remove(mint); // Cleanup
            info!("User {} removed {} from watchlist", user_id, mint);
            Ok(())
        } else {
            Err("User not found".to_string())
        }
    }

    pub fn get_watchlist(&self, user_id: &String) -> Option<Vec<String>> {
        let users = self.users.lock().unwrap();
        users.get(user_id).map(|u| u.watchlist.keys().cloned().collect())
    }

    pub fn add_vault_mapping(&self, vault: String, mint: String) {
        let mut map = self.vault_to_mint.lock().unwrap();
        map.insert(vault, mint);
    }

    pub async fn check_and_execute(&self, involved_accounts: &HashSet<String>) {
        if let Some(jupiter) = &self.jupiter {
            // Strategy Support: Resolve vaults to mints
            let mut resolved_mints = involved_accounts.clone();
            {
                let vault_map = self.vault_to_mint.lock().unwrap();
                for account in involved_accounts {
                    if let Some(mint) = vault_map.get(account) {
                        resolved_mints.insert(mint.clone());
                    }
                }
            }

            let users_guard = self.users.lock().unwrap();
            let mut sniped_guard = self.sniped.lock().unwrap();
            
            // Debug: Log registered users count  
            info!("🔎 check_and_execute: {} registered users, {} accounts in tx", 
                users_guard.len(), 
                resolved_mints.len()
            );
            
            // Find all users who need to buy
            // Tuple: (uid, mint, executor, private_key, buy_amount, slippage, priority_fee, telegram_user_id)
            let mut actions: Vec<(String, String, crate::executor::TransactionExecutor, String, f64, u64, u64, Option<String>)> = Vec::new();

            for (uid, user) in users_guard.iter() {
                for (mint, buy_amount) in &user.watchlist {
                    // ---------------------------------------------------------
                    // CREATOR FILTER CHECK
                    // ---------------------------------------------------------
                    // 1. Do we have a known creator for this mint?
                    if let Some(creator_addr) = user.creators.get(mint) {
                        // 2. Is the CREATOR one of the involved accounts (signer)?
                        if !involved_accounts.contains(creator_addr) {
                            // SKIP: The Claimer is NOT the Creator
                            // (We don't log here to avoid spamming logs on every random claim)
                            continue;
                        }
                        info!("🎯 CREATOR MATCHED! Creator {} is executing a claim on {}", creator_addr, mint);
                    } else {
                        // Edge Case: Metadata hasn't loaded yet.
                        // Action: BLOCK (Safe Mode) - Better to miss a snipe than false positive
                        // Only log periodically if needed
                        continue; 
                    }

                    info!("🔎 Checking user {} watchlist mint {} against {} resolved accounts", 
                        &uid[..8], 
                        &mint[..12],
                        resolved_mints.len()
                    );
                    if resolved_mints.contains(mint) {
                        let idempotency_key = format!("{}:{}", uid, mint);
                        if sniped_guard.contains(&idempotency_key) {
                            continue; // Already sniped
                        }

                        info!("🚀 USER {} TRIGGERED FOR MINT {}", uid, mint);
                        sniped_guard.insert(idempotency_key);
                        
                        // Convert settings to lamports/bps
                        let slippage_bps = (user.settings.slippage * 100.0) as u64;
                        let priority_fee_lamports = (user.settings.priority_fee * 1_000_000_000.0) as u64;
                        let telegram_id = user.settings.telegram_user_id.clone();

                        actions.push((
                            uid.clone(), 
                            mint.clone(), 
                            user.executor.clone(), 
                            user.private_key.clone(),
                            *buy_amount,
                            slippage_bps,
                            priority_fee_lamports,
                            telegram_id
                        ));
                    }
                }
            }
            drop(users_guard); 
            drop(sniped_guard);

            // Execute trades concurrently
            for (uid, mint, executor, private_key, amount, slippage, p_fee, telegram_id) in actions {
                let jupiter = jupiter.clone();
                let sb = self.supabase.clone();
                let tg = self.telegram.clone();
                tokio::spawn(async move {
                    info!("Executing trade for user {}: {} SOL", uid, amount);
                    
                    // Send "claim detected" notification if user has Telegram
                    if let Some(ref tg_id) = telegram_id {
                        let _ = tg.notify_claim_detected(tg_id, &mint).await;
                    }
                    
                    match executor.buy_token(
                        &private_key,
                        &mint,
                        amount,
                        slippage,
                        p_fee, 
                        &jupiter
                    ).await {
                        Ok(sig) => {
                            info!("✅ Trade Success: {}", sig);
                            // Log success and mark as sniped
                            let _ = sb.log_trade(&uid, &mint, "BUY", amount, Some(&sig), "SUCCESS", None).await;
                            let _ = sb.mark_as_sniped(&uid, &mint).await;
                            
                            // Send Telegram notification
                            if let Some(ref tg_id) = telegram_id {
                                let _ = tg.notify_trade_success(tg_id, &mint, amount, &sig).await;
                            }
                        },
                        Err(e) => {
                            error!("❌ Trade Failed: {}", e);
                            let _ = sb.log_trade(&uid, &mint, "BUY", amount, None, "FAILED", Some(&e.to_string())).await;
                            
                            // Send Telegram notification
                            if let Some(ref tg_id) = telegram_id {
                                let _ = tg.notify_trade_failed(tg_id, &mint, amount, &e.to_string()).await;
                            }
                        },
                    }
                });
            }
        }
    }
    pub async fn broadcast_log(&self, log_type: &str, message: &str) {
        let users_guard = self.users.lock().unwrap();
        let user_ids: Vec<String> = users_guard.keys().cloned().collect();
        drop(users_guard);

        for uid in user_ids {
            let sb = self.supabase.clone();
            let uid = uid.clone();
            let log_type = log_type.to_string();
            let message = message.to_string();
            tokio::spawn(async move {
                sb.log_activity(&uid, &log_type, &message).await.ok();
            });
        }
    }
}

mod supabase;
mod jupiter;
mod executor;
mod metadata;
mod geyser;
mod sniper;
mod manager;
mod telegram;

use crate::supabase::SupabaseClient;
use crate::jupiter::JupiterClient;
use crate::geyser::GeyserConnection;
use crate::sniper::Sniper;
use crate::manager::SniperManager;
use dotenv::dotenv;
use log::{error, info};
use std::env;
use std::sync::Arc;
use std::time::Duration;
use futures::StreamExt;

/// Bags Fee Share V2 Program ID
const BAGS_V2_PROGRAM_ID: &str = "FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK";
/// Bags Fee Share V1 Program ID (Official Legacy)
const BAGS_V1_PROGRAM_ID: &str = "FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("🚀 Starting Bags Claim Sniper v2.0 (gRPC Enabled)");

    // Load config
    let rpc_url = env::var("RPC_URL").expect("RPC_URL must be set");
    let grpc_url = env::var("GRPC_URL").expect("GRPC_URL must be set");
    let grpc_token = env::var("GRPC_X_TOKEN").ok();
    
    let supabase_url = env::var("SUPABASE_URL")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL"))
        .expect("SUPABASE_URL must be set");
    let supabase_key = env::var("SUPABASE_SERVICE_ROLE")
        .expect("SUPABASE_SERVICE_ROLE must be set");

    // Initialize clients
    let supabase = Arc::new(SupabaseClient::new(supabase_url, supabase_key));
    let jupiter = Arc::new(JupiterClient::new(rpc_url.clone()));
    let manager = Arc::new(SniperManager::new(rpc_url, supabase.clone(), Some(jupiter.clone())));
    let sniper = Sniper::new(manager.clone());

    // Load initial users
    info!("📦 Loading active users...");
    refresh_users(&supabase, &manager).await?;

    // Spawn user refresh task (every 1 second for "instant" updates)
    let supabase_clone = supabase.clone();
    let manager_clone = manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            if let Err(e) = refresh_users(&supabase_clone, &manager_clone).await {
                error!("User refresh failed: {}", e);
            }
        }
    });

    // Spawn heartbeat logging task (every 30 seconds)
    let manager_heartbeat = manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            manager_heartbeat.broadcast_log("INFO", "Heartbeat: Monitoring for claims (gRPC Stream Active)...").await;
        }
    });

    // gRPC Connection with Auto-Reconnect
    let mut backoff_secs = 5u64;
    const MAX_BACKOFF_SECS: u64 = 60;

    loop {
        info!("🔌 Connecting to Yellowstone gRPC...");
        
        let geyser_result = GeyserConnection::connect(
            grpc_url.clone(), 
            grpc_token.clone(), 
            None
        ).await;

        let mut geyser = match geyser_result {
            Ok(g) => {
                backoff_secs = 5; // Reset backoff on successful connect
                g
            }
            Err(e) => {
                error!("❌ gRPC Connection Failed: {}. Retrying in {}s...", e, backoff_secs);
                tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
                continue;
            }
        };

        let stream_result = geyser.subscribe_programs(vec![
            BAGS_V2_PROGRAM_ID.to_string(),
            BAGS_V1_PROGRAM_ID.to_string(),
        ]).await;

        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                error!("❌ gRPC Subscription Failed: {}. Retrying in {}s...", e, backoff_secs);
                tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
                continue;
            }
        };

        info!("👂 Listening for claim events on-chain...");
        manager.broadcast_log("INFO", "Connected to gRPC stream. Monitoring for claims...").await;

        while let Some(message) = stream.next().await {
            match message {
                Ok(update) => {
                    let sniper_clone = sniper.clone();
                    tokio::spawn(async move {
                        sniper_clone.process_update(update).await;
                    });
                }
                Err(e) => {
                    error!("❌ gRPC Stream Error: {}. Reconnecting in {}s...", e, backoff_secs);
                    manager.broadcast_log("ERROR", &format!("Stream disconnected: {}. Reconnecting...", e)).await;
                    break; // Break inner loop to reconnect
                }
            }
        }

        // Stream ended or errored - wait before reconnecting
        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
    }
}

async fn refresh_users(supabase: &SupabaseClient, manager: &SniperManager) -> anyhow::Result<()> {
    let active_users = supabase.get_active_users().await?;
    
    for user in active_users {
        let (watchlist, settings, pk) = tokio::join!(
            supabase.get_user_watchlist(&user.wallet_address),
            supabase.get_user_settings(&user.wallet_address),
            supabase.get_user_private_key(&user.wallet_address)
        );
        
        match &pk {
            Ok(Some(private_key)) => {
                let settings = settings.unwrap_or_default();
                manager.register_user(user.wallet_address.clone(), private_key.clone(), settings);
                
                if let Ok(items) = watchlist {
                    for item in items {
                        manager.add_to_watchlist(&user.wallet_address, item.mint_address, item.buy_amount).ok();
                    }
                }
            },
            Ok(None) => {
                // User has no private key, skip
            },
            Err(e) => {
                error!("❌ Error fetching private key for {}: {}", &user.wallet_address[..8], e);
            }
        }
    }
    Ok(())
}

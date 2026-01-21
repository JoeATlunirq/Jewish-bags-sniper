//! Transaction Executor for Bags Sniper
//!
//! Handles building and signing transactions via Jupiter and local Keypair

use crate::jupiter::JupiterClient;
use anyhow::{anyhow, Result};
use log::info;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::VersionedTransaction;
use std::sync::Arc;
use base64::{Engine as _, engine::general_purpose};

#[derive(Clone)]
pub struct TransactionExecutor {
    pub rpc_client: Arc<RpcClient>,
    pub paper_trading: bool,
}

impl TransactionExecutor {
    pub fn new(rpc_url: String, paper_trading: bool) -> Self {
        let rpc_client = Arc::new(RpcClient::new_with_commitment(
            rpc_url,
            CommitmentConfig::confirmed(),
        ));
        
        Self {
            rpc_client,
            paper_trading,
        }
    }

    /// Execute a buy transaction (High-speed path)
    pub async fn buy_token(
        &self,
        private_key: &str,
        token_mint: &str,
        amount_sol: f64,
        slippage_bps: u64,
        priority_fee_lamports: u64,
        jupiter: &Arc<JupiterClient>,
    ) -> Result<String> {
        if self.paper_trading {
            info!("📝 PAPER TRADE: Bought {} with {} SOL", token_mint, amount_sol);
            return Ok(format!("PAPER_TX_{}", chrono::Utc::now().timestamp()));
        }

        // 1. Prepare (Build & Sign)
        let tx = self.prepare_buy_transaction(
            private_key,
            token_mint,
            amount_sol,
            slippage_bps,
            priority_fee_lamports,
            jupiter
        ).await?;

        // 2. Send (Hot path)
        self.send_transaction(tx).await
    }

    pub async fn prepare_buy_transaction(
        &self,
        private_key: &str,
        token_mint: &str,
        amount_sol: f64,
        slippage_bps: u64,
        priority_fee_lamports: u64,
        jupiter: &Arc<JupiterClient>,
    ) -> Result<VersionedTransaction> {
        let keypair = Keypair::from_base58_string(private_key);
        let wallet_address = keypair.pubkey().to_string();

        let amount_lamports = (amount_sol * 1_000_000_000.0) as u64;
        let quote = jupiter.get_buy_quote(token_mint, amount_lamports, slippage_bps).await?;
        
        let swap_tx_base64 = jupiter.get_swap_transaction(quote, &wallet_address, priority_fee_lamports).await?;
        let versioned_tx_bytes = general_purpose::STANDARD.decode(&swap_tx_base64)
            .map_err(|e| anyhow!("Failed to decode base64 tx: {}", e))?;

        let mut versioned_tx: VersionedTransaction = bincode::deserialize(&versioned_tx_bytes)
            .map_err(|e| anyhow!("Failed to deserialize tx: {}", e))?;

        let latest_blockhash = self.rpc_client.get_latest_blockhash().await?;
        versioned_tx.message.set_recent_blockhash(latest_blockhash);

        let signed_tx = VersionedTransaction::try_new(versioned_tx.message, &[&keypair])?;
        Ok(signed_tx)
    }

    pub async fn send_transaction(&self, tx: VersionedTransaction) -> Result<String> {
        let signature = self.rpc_client.send_and_confirm_transaction(&tx).await?;
        info!("✅ Transaction confirmed: {}", signature);
        Ok(signature.to_string())
    }
}

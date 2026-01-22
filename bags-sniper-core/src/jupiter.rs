//! Jupiter API Client for Bags Sniper
//!
//! Handles swap operations:
//! - Getting quotes (SOL -> Token, Token -> SOL)
//! - Building swap transactions
//! - Executes with priority fees

use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::{anyhow, Result};
use log::info;
use std::time::Duration;

const JUPITER_API_URL: &str = "https://lite-api.jup.ag/swap/v1";
const SOL_MINT: &str = "So11111111111111111111111111111111111111112";

#[derive(Clone)]
pub struct JupiterClient {
    client: Client,
    rpc_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuoteResponse {
    #[serde(rename = "inputMint")]
    pub input_mint: String,
    #[serde(rename = "inAmount")]
    pub in_amount: String,
    #[serde(rename = "outputMint")]
    pub output_mint: String,
    #[serde(rename = "outAmount")]
    pub out_amount: String,
    #[serde(rename = "otherAmountThreshold")]
    pub other_amount_threshold: String,
    #[serde(rename = "swapMode")]
    pub swap_mode: String,
    #[serde(rename = "slippageBps")]
    pub slippage_bps: u64,
    #[serde(rename = "priceImpactPct")]
    pub price_impact_pct: String,
    #[serde(rename = "routePlan")]
    pub route_plan: Vec<RoutePlanInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutePlanInfo {
    #[serde(rename = "swapInfo")]
    pub swap_info: SwapInfo,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapInfo {
    pub label: String,
    #[serde(rename = "ammKey")]
    pub amm_key: String,
    #[serde(rename = "inputMint")]
    pub input_mint: String,
    #[serde(rename = "outputMint")]
    pub output_mint: String,
    #[serde(rename = "inAmount")]
    pub in_amount: String,
    #[serde(rename = "outAmount")]
    pub out_amount: String,
}

#[derive(Debug, Serialize)]
struct SwapRequest {
    #[serde(rename = "quoteResponse")]
    quote_response: QuoteResponse,
    #[serde(rename = "userPublicKey")]
    user_public_key: String,
    #[serde(rename = "wrapAndUnwrapSol")]
    wrap_and_unwrap_sol: bool,
    #[serde(rename = "dynamicComputeUnitLimit")]
    dynamic_compute_unit_limit: bool,
    #[serde(rename = "prioritizationFeeLamports")]
    prioritization_fee_lamports: u64,
    #[serde(rename = "computeUnitPriceMicroLamports")]
    compute_unit_price_micro_lamports: u64,
}

#[derive(Debug, Deserialize)]
struct SwapResponse {
    #[serde(rename = "swapTransaction")]
    pub swap_transaction: String,
}

impl JupiterClient {
    pub fn new(rpc_url: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            rpc_url,
        }
    }

    /// Get a quote for buying a token with SOL
    pub async fn get_buy_quote(
        &self,
        token_mint: &str,
        amount_sol_lamports: u64,
        slippage_bps: u64,
    ) -> Result<QuoteResponse> {
        let url = format!("{}/quote", JUPITER_API_URL);
        
        let response = self.client
            .get(&url)
            .query(&[
                ("inputMint", SOL_MINT),
                ("outputMint", token_mint),
                ("amount", &amount_sol_lamports.to_string()),
                ("slippageBps", &slippage_bps.to_string()),
            ])
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Jupiter quote error: {}", error_text));
        }

        let quote: QuoteResponse = response.json().await?;
        
        info!("📊 Jupiter quote: {} SOL -> {} tokens (impact: {}%)",
            amount_sol_lamports as f64 / 1e9,
            quote.out_amount,
            quote.price_impact_pct);

        Ok(quote)
    }

    /// Get swap transaction from Jupiter
    pub async fn get_swap_transaction(
        &self,
        quote: QuoteResponse,
        user_pubkey: &str,
        priority_fee_lamports: u64,
    ) -> Result<String> {
        let url = format!("{}/swap", JUPITER_API_URL);

        let swap_request = SwapRequest {
            quote_response: quote,
            user_public_key: user_pubkey.to_string(),
            wrap_and_unwrap_sol: true,
            dynamic_compute_unit_limit: true,
            prioritization_fee_lamports: priority_fee_lamports.max(100), // Ensure at least some fee
            compute_unit_price_micro_lamports: 10000, // ~0.01 SOL per 1M CU, helps land faster
        };

        info!("📤 Sending Swap Request: {}", serde_json::to_string(&swap_request).unwrap_or_default());

        let response = self.client
            .post(&url)
            .json(&swap_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Jupiter swap error: {}", error_text));
        }

        let swap_response: SwapResponse = response.json().await?;
        
        info!("📝 Jupiter swap transaction received");
        
        Ok(swap_response.swap_transaction)
    }
}

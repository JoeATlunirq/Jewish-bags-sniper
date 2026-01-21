use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use mpl_token_metadata::accounts::Metadata;
use anyhow::{Result, anyhow};
use log::{info, error};

pub fn fetch_creator(rpc_client: &RpcClient, mint: &Pubkey) -> Result<Pubkey> {
    // 1. Derive Metadata PDA
    let (metadata_pda, _) = Metadata::find_pda(mint);

    // 2. Fetch Account Data
    let account_data = rpc_client.get_account_data(&metadata_pda)?;

    // 3. Deserialize Metadata
    let metadata = Metadata::from_bytes(&account_data)?;

    // 4. Extract Creator
    // Priority: 
    // A. First Verified Creator in `creators` list
    // B. Update Authority (fallback)
    
    if let Some(creators) = metadata.creators {
        if let Some(first_verified) = creators.iter().find(|c| c.verified) {
            info!("Found verified creator for {}: {}", mint, first_verified.address);
            return Ok(first_verified.address);
        } else if let Some(first) = creators.first() {
            // Fallback to first creator even if not verified (common in some launches)
            info!("Found unverified creator for {}: {}", mint, first.address);
            return Ok(first.address);
        }
    }

    // Fallback to update authority
    info!("No creators found for {}, using update authority: {}", mint, metadata.update_authority);
    Ok(metadata.update_authority)
}

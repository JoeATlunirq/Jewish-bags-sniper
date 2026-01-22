use crate::manager::SniperManager;
use yellowstone_grpc_proto::geyser::{SubscribeUpdate, SubscribeUpdateTransaction};
use std::collections::HashSet;
use std::sync::Arc;
use log::info;

#[derive(Clone)]
pub struct Sniper {
    manager: Arc<SniperManager>,
}

impl Sniper {
    pub fn new(manager: Arc<SniperManager>) -> Self {
        Self { manager }
    }

    pub async fn process_update(&self, update: SubscribeUpdate) {
        if let Some(update_oneof) = update.update_oneof {
             match update_oneof {
                 yellowstone_grpc_proto::geyser::subscribe_update::UpdateOneof::Transaction(tx_update) => {
                     self.process_transaction(tx_update).await;
                 }
                 _ => {}
             }
        }
    }

    async fn process_transaction(&self, tx: SubscribeUpdateTransaction) {
        let slot = tx.slot;
        let tx_info = match tx.transaction {
            Some(t) => t,
            None => return,
        };
        let sig = bs58::encode(&tx_info.signature).into_string();

        let message = match tx_info.transaction {
             Some(t) => t.message,
             None => return,
        };
        
        let account_keys = match message.as_ref() {
            Some(m) => &m.account_keys,
            None => return,
        };

        let instructions = match message.as_ref() {
            Some(m) => &m.instructions,
            None => return,
        };

        // Official Bags Fee Share V2 Discriminators from IDL
        // claim_damm_v2: [232, 175, 106, 19, 168, 54, 186, 108] - Protocol fee distribution
        // claim_dbc: [229, 142, 38, 65, 198, 50, 110, 58] - DBC fee distribution
        // claim_user: [164, 64, 55, 199, 90, 78, 147, 188] - User claiming their fees (CREATOR CLAIM!)
        let claim_damm_v2: [u8; 8] = [232, 175, 106, 19, 168, 54, 186, 108];
        let claim_dbc: [u8; 8] = [229, 142, 38, 65, 198, 50, 110, 58];
        let claim_user: [u8; 8] = [164, 64, 55, 199, 90, 78, 147, 188];

        for inst in instructions {
            // Get the program ID for this instruction
            let program_id = match account_keys.get(inst.program_id_index as usize) {
                Some(k) => bs58::encode(k).into_string(),
                None => continue,
            };

            // Monitor Bags Fee Share V1 & V2
            if program_id == "FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK" || program_id == "FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi" {
                let disc = if inst.data.len() >= 8 { hex::encode(&inst.data[..8]) } else { "none".to_string() };
                
                // Debug log for every Bags interaction
                info!(
                    "🔍 [SLOT {}] Bags Interaction | Program: {} | Disc: {} | Data Len: {}", 
                    slot, 
                    &program_id[..8], 
                    disc,
                    inst.data.len()
                );

                // Check if it's a CLAIM instruction
                // claim_user = Creator/User withdrawing their fees (PRIMARY TARGET)
                // claim_damm_v2/claim_dbc = Protocol distribution events (also relevant)
                let is_claim = inst.data.starts_with(&claim_user) || 
                              inst.data.starts_with(&claim_damm_v2) || 
                              inst.data.starts_with(&claim_dbc);

                if is_claim {
                    let claim_type = if inst.data.starts_with(&claim_user) { "CLAIM_USER" }
                                    else if inst.data.starts_with(&claim_damm_v2) { "DAMM_V2" }
                                    else { "DBC" };
                    info!(
                        "🎯🎯🎯 CLAIM DETECTED! Type: {} | Sig: {}...", 
                        claim_type,
                        &sig[..10]
                    );
                    
                    // Strategy A & B: Extract all accounts involved in this instruction
                    let mut involved_accounts = HashSet::new();
                    for &index in &inst.accounts {
                        if let Some(key_bytes) = account_keys.get(index as usize) {
                            involved_accounts.insert(bs58::encode(key_bytes).into_string());
                        }
                    }

                    info!(
                        "🎯 [SLOT {}] Bags CLAIM Matched! | Sig: {}... | Accounts: {}", 
                        slot, 
                        &sig[..10], 
                        involved_accounts.len()
                    );

                    // Delegate to Manager to check all users
                    self.manager.check_and_execute(&involved_accounts).await;
                }
            }
        }
    }
}

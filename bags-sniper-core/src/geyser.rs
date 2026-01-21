//! Yellowstone gRPC Connection for Bags Sniper
//!
//! Real-time subscription to Solana transactions via Geyser plugin

use tonic::transport::{Channel, ClientTlsConfig};
use tonic::metadata::MetadataValue;
use tonic::{Request, Streaming};
use yellowstone_grpc_proto::geyser::{
    geyser_client::GeyserClient,
    SubscribeRequest, SubscribeRequestFilterTransactions,
    SubscribeUpdate, CommitmentLevel,
};
use std::collections::HashMap;
use anyhow::Result;
use log::info;

pub struct GeyserConnection {
    client: GeyserClient<tonic::service::interceptor::InterceptedService<Channel, Box<dyn Fn(tonic::Request<()>) -> Result<tonic::Request<()>, tonic::Status> + Send + Sync + 'static>>>,
}

impl GeyserConnection {
    /// Connect to Yellowstone gRPC endpoint
    pub async fn connect(
        url: String,
        x_token: Option<String>,
        auth: Option<(String, String)>,
    ) -> Result<Self> {
        info!("Connecting to Yellowstone gRPC: {}", url);
        
        // Parse URL and setup TLS
        let endpoint = if url.starts_with("https://") {
            let tls = ClientTlsConfig::new();
            Channel::from_shared(url)?
                .tls_config(tls)?
        } else if url.contains(":443") {
            // Assume TLS for port 443
            let full_url = if url.starts_with("http") {
                url.replace("http://", "https://")
            } else {
                format!("https://{}", url)
            };
            let tls = ClientTlsConfig::new();
            Channel::from_shared(full_url)?
                .tls_config(tls)?
        } else {
            Channel::from_shared(url)?
        };
        
        let channel = endpoint.connect().await?;
        
        // Create client with auth interceptor
        let client = GeyserClient::with_interceptor(channel, Box::new(move |mut req: Request<()>| {
            if let Some(token) = &x_token {
                let token_val: MetadataValue<_> = token.parse().map_err(|e: tonic::metadata::errors::InvalidMetadataValue| tonic::Status::invalid_argument(e.to_string()))?;
                req.metadata_mut().insert("x-token", token_val);
            } else if let Some((username, password)) = &auth {
                use base64::{Engine as _, engine::general_purpose};
                let auth_string = format!("{}:{}", username, password);
                let encoded = general_purpose::STANDARD.encode(&auth_string);
                let auth_val: MetadataValue<_> = format!("Basic {}", encoded).parse().map_err(|e: tonic::metadata::errors::InvalidMetadataValue| tonic::Status::invalid_argument(e.to_string()))?;
                req.metadata_mut().insert("authorization", auth_val);
            }
            Ok(req)
        }) as Box<dyn Fn(tonic::Request<()>) -> Result<tonic::Request<()>, tonic::Status> + Send + Sync + 'static>);
        
        info!("✅ Connected to Yellowstone gRPC");
        
        Ok(Self { client })
    }

    /// Subscribe to transactions involve specific programs
    pub async fn subscribe_programs(
        &mut self,
        program_ids: Vec<String>,
    ) -> Result<Streaming<SubscribeUpdate>> {
        info!("Subscribing to programs: {:?}", program_ids);
        
        // Build subscription request
        let mut transactions = HashMap::new();
        transactions.insert(
            "bags_programs".to_string(),
            SubscribeRequestFilterTransactions {
                vote: Some(false),
                failed: Some(false),
                signature: None,
                account_include: program_ids,
                account_exclude: vec![],
                account_required: vec![], // Removed to catch transactions hitting ANY of the IDs
            },
        );

        let request = SubscribeRequest {
            slots: HashMap::new(),
            accounts: HashMap::new(),
            transactions,
            blocks: HashMap::new(),
            blocks_meta: HashMap::new(),
            entry: HashMap::new(),
            commitment: Some(CommitmentLevel::Confirmed as i32),
            accounts_data_slice: vec![],
            ping: None,
            transactions_status: HashMap::new(),
        };

        let request_stream = tokio_stream::iter(std::iter::once(request));
        let response = self.client.subscribe(request_stream).await?;
        let stream = response.into_inner();
        
        info!("✅ Subscribed to transaction stream");
        
        Ok(stream)
    }
}

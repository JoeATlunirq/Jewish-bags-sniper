//! Encryption utilities for private keys
//! Uses AES-256-GCM with PBKDF2 key derivation (matching frontend implementation)

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

const SALT: &[u8] = b"bags-sniper-salt-v1";
const ITERATIONS: u32 = 100000;

/// Derive a 256-bit key from the encryption key string using PBKDF2
fn derive_key(encryption_key: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(encryption_key.as_bytes(), SALT, ITERATIONS, &mut key);
    key
}

/// Decrypt a private key from storage
/// Handles both encrypted ("ENCRYPTED:iv_hex:ciphertext_hex") and legacy unencrypted keys
pub fn decrypt_private_key(stored_key: &str, encryption_key: &str) -> Result<String> {
    // Handle legacy unencrypted keys (backwards compatibility)
    if !stored_key.starts_with("ENCRYPTED:") {
        return Ok(stored_key.to_string());
    }

    let parts: Vec<&str> = stored_key.split(':').collect();
    if parts.len() != 3 {
        return Err(anyhow!("Invalid encrypted key format"));
    }

    let iv_hex = parts[1];
    let ciphertext_hex = parts[2];

    // Decode hex
    let iv = hex::decode(iv_hex).map_err(|e| anyhow!("Invalid IV hex: {}", e))?;
    let ciphertext = hex::decode(ciphertext_hex).map_err(|e| anyhow!("Invalid ciphertext hex: {}", e))?;

    // Derive key
    let key = derive_key(encryption_key);

    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| anyhow!("Failed to create cipher: {}", e))?;

    // Create nonce (12 bytes for GCM)
    if iv.len() != 12 {
        return Err(anyhow!("Invalid IV length: expected 12, got {}", iv.len()));
    }
    let nonce = Nonce::from_slice(&iv);

    // Decrypt
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| anyhow!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| anyhow!("Invalid UTF-8 in decrypted key: {}", e))
}

/// Check if a key is already encrypted
pub fn is_encrypted(stored_key: &str) -> bool {
    stored_key.starts_with("ENCRYPTED:")
}

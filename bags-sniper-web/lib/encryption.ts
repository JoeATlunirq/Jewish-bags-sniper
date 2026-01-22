// Encryption utilities for private keys
// Uses AES-GCM via SubtleCrypto (Web Crypto API)

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;

// Helper to convert ArrayBuffer to hex
function arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper to convert hex to ArrayBuffer
function hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer.slice(0) as ArrayBuffer;
}

// Derive a 256-bit key from the encryption key string
async function getKey(): Promise<CryptoKey> {
    if (!ENCRYPTION_KEY) {
        throw new Error("ENCRYPTION_KEY not set in environment");
    }

    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY).buffer.slice(0) as ArrayBuffer;
    const salt = encoder.encode("bags-sniper-salt-v1").buffer.slice(0) as ArrayBuffer;

    // Use PBKDF2 to derive a key from the password
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        keyData,
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypt a private key for storage
 * Returns: "ENCRYPTED:iv_hex:ciphertext_hex"
 */
export async function encryptPrivateKey(privateKey: string): Promise<string> {
    try {
        const key = await getKey();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

        const encoder = new TextEncoder();
        const plaintext = encoder.encode(privateKey).buffer.slice(0) as ArrayBuffer;

        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
            key,
            plaintext
        );

        return `ENCRYPTED:${arrayBufferToHex(iv.buffer.slice(0) as ArrayBuffer)}:${arrayBufferToHex(ciphertext)}`;
    } catch (error) {
        console.error("Encryption failed:", error);
        throw new Error("Failed to encrypt private key");
    }
}

/**
 * Decrypt a private key from storage
 * Handles both encrypted ("ENCRYPTED:...") and legacy unencrypted keys
 */
export async function decryptPrivateKey(storedKey: string): Promise<string> {
    // Handle legacy unencrypted keys (backwards compatibility)
    if (!storedKey.startsWith("ENCRYPTED:")) {
        return storedKey;
    }

    try {
        const parts = storedKey.split(":");
        if (parts.length !== 3) {
            throw new Error("Invalid encrypted key format");
        }

        const iv = hexToArrayBuffer(parts[1]);
        const ciphertext = hexToArrayBuffer(parts[2]);
        const key = await getKey();

        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        return decoder.decode(plaintext);
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Failed to decrypt private key");
    }
}

/**
 * Check if a key is already encrypted
 */
export function isEncrypted(storedKey: string): boolean {
    return storedKey.startsWith("ENCRYPTED:");
}

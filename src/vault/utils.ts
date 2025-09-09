import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM Encryption utilities for CloudCruise vault data
 * Uses 12-byte IV and returns concatenated hex: iv(24 hex) + ciphertext + tag(32 hex)
 */

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param data - Data to encrypt (will be JSON stringified)
 * @param keyHex - Hex-encoded encryption key
 * @returns Concatenated hex string: iv(24 hex) + ciphertext + tag(32 hex)
 */
export async function encryptData(data: any, keyHex: string): Promise<string> {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(12); // 12-byte IV for GCM

    const jsonData = JSON.stringify(data);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + encrypted + tag;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts data using AES-256-GCM
 * @param encryptedHex - Concatenated hex: iv(24 hex) + ciphertext + tag(32 hex)
 * @param keyHex - Hex-encoded encryption key
 * @returns Decrypted and parsed data
 */
export async function decryptData(encryptedHex: string, keyHex: string): Promise<any> {
  try {
    if (typeof encryptedHex !== 'string' || encryptedHex.length < 56) {
      throw new Error('Invalid encrypted payload');
    }

    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(encryptedHex.slice(0, 24), 'hex');
    const tag = Buffer.from(encryptedHex.slice(-32), 'hex');
    const encrypted = encryptedHex.slice(24, -32);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypts sensitive fields in a vault entry
 * Fields encrypted: user_name, password, tfa_secret (if present)
 * @param entry - Vault entry with potentially sensitive data
 * @param encryptionKey - Hex-encoded encryption key
 * @returns Entry with encrypted sensitive fields
 */
export async function encryptSensitiveFields(entry: any, encryptionKey: string): Promise<any> {
  const encryptedEntry = { ...entry };
  
  if (entry.user_name !== undefined) {
    encryptedEntry.user_name = await encryptData(entry.user_name, encryptionKey);
  }

  if (entry.password !== undefined) {
    encryptedEntry.password = await encryptData(entry.password, encryptionKey);
  }
  
  if (entry.tfa_secret !== undefined) {
    encryptedEntry.tfa_secret = await encryptData(entry.tfa_secret, encryptionKey);
  }
  
  return encryptedEntry;
}

/**
 * Decrypts sensitive fields in a vault entry
 * @param entry - Vault entry with encrypted sensitive fields
 * @param encryptionKey - Hex-encoded encryption key
 * @returns Entry with decrypted sensitive fields
 */
export async function decryptSensitiveFields(entry: any, encryptionKey: string): Promise<any> {
  const decryptedEntry = { ...entry };
  
  if (typeof entry.user_name === 'string') {
    try {
      decryptedEntry.user_name = await decryptData(entry.user_name, encryptionKey);
    } catch {}
  }
  
  if (typeof entry.password === 'string') {
    try {
      decryptedEntry.password = await decryptData(entry.password, encryptionKey);
    } catch {}
  }
  
  if (typeof entry.tfa_secret === 'string') {
    try {
      decryptedEntry.tfa_secret = await decryptData(entry.tfa_secret, encryptionKey);
    } catch {}
  }
  
  return decryptedEntry;
}

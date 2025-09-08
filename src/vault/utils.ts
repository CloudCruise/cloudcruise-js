import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import type { EncryptionResult, DecryptionParams } from './types.js';

const scryptAsync = promisify(scrypt);

/**
 * AES-256-GCM Encryption utilities for CloudCruise vault data
 * Based on NIST SP 800-57 recommendations with envelope encryption
 */

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param data - Data to encrypt (will be JSON stringified)
 * @param keyHex - Hex-encoded encryption key
 * @returns Encrypted result with IV and auth tag
 */
export async function encryptData(data: any, keyHex: string): Promise<EncryptionResult> {
  try {
    // Convert hex key to buffer
    const key = Buffer.from(keyHex, 'hex');
    
    // Generate random IV (16 bytes for GCM)
    const iv = randomBytes(16);
    
    // Create cipher
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    
    // Serialize and encrypt data
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts data using AES-256-GCM
 * @param params - Decryption parameters
 * @returns Decrypted and parsed data
 */
export async function decryptData(params: DecryptionParams): Promise<any> {
  try {
    const { encrypted, iv, authTag, key: keyHex } = params;
    
    // Convert hex strings to buffers
    const key = Buffer.from(keyHex, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    
    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse JSON
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypts sensitive fields in a vault entry
 * Fields that should be encrypted: password, tfa_secret
 * @param entry - Vault entry with potentially sensitive data
 * @param encryptionKey - Hex-encoded encryption key
 * @returns Entry with encrypted sensitive fields
 */
export async function encryptSensitiveFields(entry: any, encryptionKey: string): Promise<any> {
  const encryptedEntry = { ...entry };
  
  // Encrypt password if present
  if (entry.password) {
    const encrypted = await encryptData(entry.password, encryptionKey);
    encryptedEntry.password = `${encrypted.encrypted}:${encrypted.iv}:${encrypted.authTag}`;
  }
  
  // Encrypt TFA secret if present
  if (entry.tfa_secret) {
    const encrypted = await encryptData(entry.tfa_secret, encryptionKey);
    encryptedEntry.tfa_secret = `${encrypted.encrypted}:${encrypted.iv}:${encrypted.authTag}`;
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
  
  // Decrypt password if present and encrypted
  if (entry.password && typeof entry.password === 'string' && entry.password.includes(':')) {
    const [encrypted, iv, authTag] = entry.password.split(':');
    if (encrypted && iv && authTag) {
      decryptedEntry.password = await decryptData({ encrypted, iv, authTag, key: encryptionKey });
    }
  }
  
  // Decrypt TFA secret if present and encrypted
  if (entry.tfa_secret && typeof entry.tfa_secret === 'string' && entry.tfa_secret.includes(':')) {
    const [encrypted, iv, authTag] = entry.tfa_secret.split(':');
    if (encrypted && iv && authTag) {
      decryptedEntry.tfa_secret = await decryptData({ encrypted, iv, authTag, key: encryptionKey });
    }
  }
  
  return decryptedEntry;
}

/**
 * Derives an encryption key from a password using scrypt
 * @param password - Password to derive key from
 * @param salt - Salt for key derivation (should be random for each password)
 * @returns Hex-encoded encryption key
 */
export async function deriveEncryptionKey(password: string, salt: Buffer): Promise<string> {
  const key = await scryptAsync(password, salt, 32) as Buffer;
  return key.toString('hex');
}

/**
 * Generates a random salt for key derivation
 * @returns Random salt buffer
 */
export function generateSalt(): Buffer {
  return randomBytes(32);
}
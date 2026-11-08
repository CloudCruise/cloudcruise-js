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

async function decryptOrKeep(value: unknown, encryptionKey: string): Promise<unknown> {
  if (typeof value !== 'string') return value;
  try {
    return await decryptData(value, encryptionKey);
  } catch {
    return value;
  }
}

function required(item: any, key: string, path: string): any {
  if (item?.[key] === undefined || item?.[key] === null) {
    throw new Error(`${path}.${key} is required`);
  }
  return item[key];
}

/**
 * Encrypts sensitive fields in a vault entry
 * Fields encrypted: user_name, password, tfa_secret (if present), every
 * additional field value, every security question and answer, and proxy_value when proxy_setting is "custom"
 * (the bring-your-own proxy URL).
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

  if (Array.isArray(entry.additional_fields)) {
    encryptedEntry.additional_fields = await Promise.all(
      entry.additional_fields.map(async (field: any, i: number) => ({
        name: required(field, 'name', `additional_fields[${i}]`),
        type: required(field, 'type', `additional_fields[${i}]`),
        value: await encryptData(required(field, 'value', `additional_fields[${i}]`), encryptionKey)
      }))
    );
  }

  if (Array.isArray(entry.security_questions)) {
    encryptedEntry.security_questions = await Promise.all(
      entry.security_questions.map(async (item: any, i: number) => ({
        question: await encryptData(required(item, 'question', `security_questions[${i}]`), encryptionKey),
        answer: await encryptData(required(item, 'answer', `security_questions[${i}]`), encryptionKey)
      }))
    );
  }

  // proxy_value is meaningless to the backend without proxy_setting, which is
  // also the discriminator that tells us whether to encrypt. Fail closed: a
  // custom proxy URL (often with embedded credentials) must never be sent in
  // plaintext because the caller forgot the mode on a partial update.
  if (
    entry.proxy_value !== undefined &&
    entry.proxy_value !== null &&
    (entry.proxy_setting === undefined || entry.proxy_setting === null)
  ) {
    throw new Error(
      "proxy_value requires proxy_setting. Pass proxy_setting: 'custom' for a " +
        "bring-your-own proxy URL (so it is encrypted before sending), or " +
        "'static'/'country' for a managed proxy."
    );
  }

  if (
    entry.proxy_setting === 'custom' &&
    entry.proxy_value !== undefined &&
    entry.proxy_value !== null
  ) {
    encryptedEntry.proxy_value = await encryptData(entry.proxy_value, encryptionKey);
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

  for (const key of ['user_name', 'password', 'tfa_secret']) {
    if (key in entry) {
      decryptedEntry[key] = await decryptOrKeep(entry[key], encryptionKey);
    }
  }

  if (Array.isArray(entry.additional_fields)) {
    decryptedEntry.additional_fields = await Promise.all(
      entry.additional_fields.map(async (field: any) => ({
        ...field,
        value: await decryptOrKeep(field?.value, encryptionKey)
      }))
    );
  }

  if (Array.isArray(entry.security_questions)) {
    decryptedEntry.security_questions = await Promise.all(
      entry.security_questions.map(async (item: any) => ({
        ...item,
        question: await decryptOrKeep(item?.question, encryptionKey),
        answer: await decryptOrKeep(item?.answer, encryptionKey)
      }))
    );
  }

  if (entry.proxy_setting === 'custom' && 'proxy_value' in entry) {
    decryptedEntry.proxy_value = await decryptOrKeep(entry.proxy_value, encryptionKey);
  }

  return decryptedEntry;
}

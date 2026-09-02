import crypto from 'crypto';

/**
 * Encryption for anything this app writes to disk.
 *
 * The store is persisted to a JSON file so a restart does not take the
 * conversation with it. That file is plain text on a disk we do not control —
 * on a free-tier host it sits in a container image alongside whatever else is
 * running, and a stray `cat` of it in a support session, a mis-scoped backup or
 * a log shipper reading the data directory would expose every direct message
 * anyone has ever sent. Message bodies and email addresses are therefore
 * encrypted before they are written and decrypted on load, so the file on disk
 * is useless without the key.
 *
 * AES-256-GCM: authenticated, so a tampered file fails to decrypt rather than
 * silently yielding altered text. A fresh 12-byte IV per value — reusing an IV
 * under GCM with the same key leaks the XOR of the two plaintexts.
 *
 * Password hashes are NOT encrypted here. They are bcrypt digests already, and
 * encrypting them would only mean a lost key locks every account out.
 */

// No dot in the tag itself: the envelope is split on dots, and a prefix that
// contained one shifted every field by one position — the decrypt read the
// version string as the IV, failed its auth check, and the caller dropped the
// value as unreadable. On load that quietly deleted every stored account.
const PREFIX = 'encv1';
const SALT = 'querysphere.data.v1'; // fixed: the derived key must be stable across restarts

let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;

  const explicit = process.env.DATA_ENCRYPTION_KEY;
  if (explicit) {
    const buf = Buffer.from(explicit.trim(), 'hex');
    if (buf.length !== 32) {
      throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes of hex (openssl rand -hex 32)');
    }
    cachedKey = buf;
    return cachedKey;
  }

  // Falling back to JWT_SECRET keeps a single-secret deployment working, but it
  // ties two unrelated concerns together: rotating the signing key would then
  // also make the stored history unreadable. Say so once, loudly.
  console.warn('⚠️  DATA_ENCRYPTION_KEY not set — deriving the at-rest key from JWT_SECRET.');
  console.warn('    Set DATA_ENCRYPTION_KEY (openssl rand -hex 32) so rotating JWT_SECRET does not destroy stored messages.');
  cachedKey = crypto.scryptSync(process.env.JWT_SECRET, SALT, 32);
  return cachedKey;
}

/** Encrypt a string for storage. Returns `enc.v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptField(plain) {
  if (plain === null || plain === undefined) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/**
 * Decrypt a stored string.
 *
 * A value that is not in our envelope is returned untouched: a store file
 * written before encryption existed still loads, rather than the whole history
 * vanishing behind a thrown error on the first boot after an upgrade.
 */
export function decryptField(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(`${PREFIX}.`)) return stored;
  const [, ivB64, tagB64, ctB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !ctB64) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, or the file was edited. Do not crash the boot and do not
    // surface ciphertext to a reader as if it were their message.
    return null;
  }
}

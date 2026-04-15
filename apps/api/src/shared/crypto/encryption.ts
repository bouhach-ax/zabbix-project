import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '../../config/env.js'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex')
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Format of returned string: iv:authTag:ciphertext (all hex-encoded)
 *
 * @param text - Plaintext to encrypt
 * @returns Encrypted string in iv:tag:ciphertext format
 */
export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const key = getKey()
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a string previously encrypted with {@link encrypt}.
 *
 * @param encryptedText - Encrypted string in iv:tag:ciphertext format
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (tampered data, wrong key, etc.)
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format')
  }
  const [ivHex, tagHex, dataHex] = parts as [string, string, string]

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const key = getKey()

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}

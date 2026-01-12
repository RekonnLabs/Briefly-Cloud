import crypto from 'crypto'

/**
 * Compute SHA256 hash of content for deduplication
 * @param content - Text content to hash
 * @returns SHA256 hex digest
 */
export function computeContentHash(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content, 'utf8')
    .digest('hex')
}

/**
 * Compute SHA256 hash of buffer for deduplication
 * @param buffer - Buffer to hash
 * @returns SHA256 hex digest
 */
export function computeBufferHash(buffer: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex')
}

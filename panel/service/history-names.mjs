import crypto from 'node:crypto';

export const NO_DOCUMENT_KEY = 'no-document';

/**
 * A transcript filename must be a stable, collision-free function of the full
 * thread id. A readable slug alone is not enough: Windows paths, `#2` thread
 * suffixes and an 80-character cap made different conversations resolve to the
 * same file (the skin-retouch transcript bug). Keep a short slug for humans and
 * append a hash of the complete id.
 */
export function historyFileName(key) {
  const id = String(key || NO_DOCUMENT_KEY);
  const slug = id.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'thread';
  const hash = crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);
  return `${slug}-${hash}.json`;
}

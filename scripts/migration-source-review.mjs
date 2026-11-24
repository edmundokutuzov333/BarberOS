import { createHash } from 'node:crypto';

// A disposition approves specific historical SQL, never an editable filename.
// Existing contract-based reviews without hashes remain readable; newly retired
// sources require a fingerprint because no server history record represents them.
export function validSourceReview(review, content) {
  if (!review || typeof review.status !== 'string' || !review.status.trim()
    || typeof review.evidence !== 'string' || review.evidence.trim().length < 12
    || typeof content !== 'string') return false;
  if (review.status.startsWith('retired_') && !review.source_sha256) return false;
  if (review.source_sha256 !== undefined) {
    if (typeof review.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(review.source_sha256)) return false;
    return createHash('sha256').update(content).digest('hex') === review.source_sha256;
  }
  return true;
}

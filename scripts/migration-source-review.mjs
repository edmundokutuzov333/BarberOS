import { createHash } from 'node:crypto';

// A disposition approves specific historical SQL, never an editable filename.
// Existing contract-based reviews without hashes remain readable; newly retired
// sources require a fingerprint because no server history record represents them.
export function validSourceReview(review, content, readCandidate) {
  if (!review || typeof review.status !== 'string' || !review.status.trim()
    || typeof review.evidence !== 'string' || review.evidence.trim().length < 12
    || typeof content !== 'string') return false;
  const pending = review.status === 'reviewed_pending_forward';
  if ((review.status.startsWith('retired_') || pending) && !review.source_sha256) return false;
  if (review.source_sha256 !== undefined) {
    if (typeof review.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(review.source_sha256)) return false;
    if (createHash('sha256').update(content).digest('hex') !== review.source_sha256) return false;
  }
  if (pending) {
    if (!Array.isArray(review.forward_candidates) || !review.forward_candidates.length || typeof readCandidate !== 'function') return false;
    for (const candidate of review.forward_candidates) {
      if (!/^supabase\/reconciliation\/[a-z_]+\.sql$/.test(candidate?.path ?? '') || !/^[0-9a-f]{64}$/.test(candidate.sha256 ?? '')) return false;
      try {
        if (createHash('sha256').update(readCandidate(candidate.path)).digest('hex') !== candidate.sha256) return false;
      } catch { return false; }
    }
  }
  return true;
}

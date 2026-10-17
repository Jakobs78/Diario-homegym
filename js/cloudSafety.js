/**
 * Read-only cloud recovery decisions. Never use client timestamps as proof
 * that two full workout journals are identical.
 *
 * Supabase JSONB may reorder object keys; compare JSON semantics, not
 * insertion order, and never infer missing workouts from empty arrays.
 */
const canonicalJson = value => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
        : entry);

/** Hash of the last cloud-acknowledged journal, never a substitute backup. */
export async function journalFingerprint(value) {
    const encoded = new TextEncoder().encode(canonicalJson(value));
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function sameJournal(left, right) {
    if (left === right) return true;
    if (left === null || left === undefined || right === null || right === undefined)
        return false;
    try { return canonicalJson(left) === canonicalJson(right); }
    catch { return false; }
}

function pristine(data) {
    if (!data) return true;
    if (typeof data !== 'object' || Array.isArray(data) ||
        !data.history?.years || typeof data.history.years !== 'object') return false;
    // Never erase a local-only profile/equipment configuration merely
    // because it contains zero mesocycles.
    if (data.updatedAt) return false;
    if (Object.values(data.history?.years || {}).some(y => y?.mesocycles?.length)) return false;
    const athlete = data.athlete || {};
    return Object.entries(athlete).every(([key, value]) =>
        key === 'email' && (value === null || value === ''));
}

/** pending > pristine restore > equal > explicit conflict. */
export function cloudRecoveryDecision(local, remote, {pending = false} = {}) {
    if (pending) return 'pending';
    if (remote === null || remote === undefined)
        return pristine(local) ? 'empty' : 'missing_cloud';
    if (pristine(local)) return 'restore_cloud';
    return sameJournal(local, remote) ? 'identical' : 'conflict';
}

/**
 * A known, locally unchanged cloud snapshot can be refreshed when another
 * device publishes a newer revision. If the local copy has changed (including
 * an offline edit whose queue vanished), require an explicit conflict review.
 */
export function safeRemoteRefresh({oldRevision,remoteRevision,localFingerprint,
    acknowledgedFingerprint} = {}) {
    return Boolean(oldRevision && remoteRevision &&
        oldRevision !== remoteRevision && acknowledgedFingerprint &&
        localFingerprint === acknowledgedFingerprint);
}

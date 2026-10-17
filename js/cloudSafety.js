/**
 * Read-only cloud recovery decisions. Never use client timestamps as proof
 * that two full workout journals are identical.
 *
 * Supabase JSONB may reorder object keys; compare JSON semantics, not
 * insertion order, and never infer missing workouts from empty arrays.
 */
export function sameJournal(left, right) {
    if (left === right) return true;
    if (left === null || left === undefined || right === null || right === undefined)
        return false;
    const normalize = value => JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry)
            ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
            : entry);
    try { return normalize(left) === normalize(right); }
    catch { return false; }
}

function pristine(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return true;
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

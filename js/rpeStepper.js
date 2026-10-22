/** Accessible half-point RPE control. Only the athlete's explicit tap edits the draft. */
const numeric = raw => {
    const text = String(raw ?? '').trim().replace(/^@/, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 5 && n <= 10 ? n : null;
};

export function stepRpe(current, direction, prescribed = null) {
    if (direction !== 1 && direction !== -1) return null;
    // A blank field remains unknown until the athlete explicitly taps a button.
    const base = numeric(current) ?? numeric(prescribed);
    if (base === null) return null;
    // Record genuinely light efforts too; e1RM eligibility is checked separately.
    const lower = 5;
    const value = Math.min(10, Math.max(lower, Math.round((base + direction * 0.5) * 2) / 2));
    return String(value);
}

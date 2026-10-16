/**
 * Check-in pre-seduta: dati auto-dichiarati, non diagnosi.
 * Mai dedurre dolore, sonno o readiness da RPE/serie mancanti.
 * Il coach può sconsigliare un incremento o suggerire di fermarsi,
 * ma non cambia di nascosto kg, ripetizioni e serie confermate.
 */
export const READINESS_CHOICES = Object.freeze({
    sleep: Object.freeze(['ok', 'poor']),
    energy: Object.freeze(['ok', 'low']),
    soreness: Object.freeze(['ok', 'high']),
    pain: Object.freeze(['none', 'present'])
});

export function validateSessionCheckin(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return { ok: false, message: 'Completa il check-in prima di confermarlo.' };
    for (const [key, allowed] of Object.entries(READINESS_CHOICES)) {
        if (!allowed.includes(data[key]))
            return { ok: false, message: 'Seleziona un valore valido per ' + key + '.' };
    }
    return {
        ok: true,
        data: {
            sleep: data.sleep, energy: data.energy,
            soreness: data.soreness, pain: data.pain
        }
    };
}

/** Un check-in passato o invalidato non può condizionare una nuova seduta. */
export function assessSessionReadiness(checkin, { now = Date.now() } = {}) {
    const parsed = validateSessionCheckin(checkin);
    const stamp = Date.parse(checkin?.checkedAt ?? '');
    const today = new Date(now);
    const sameDay = Number.isFinite(stamp) &&
        new Date(stamp).toDateString() === today.toDateString() &&
        stamp <= now + 60_000;
    if (!parsed.ok || !sameDay) return {
        level: 'unknown', allowIncrease: true, avoidTechniques: false,
        reasons: [], message: 'Check-in non disponibile per oggi: nessuna stima del recupero.'
    };
    const { sleep, energy, soreness, pain } = parsed.data;
    const reasons = [];
    if (sleep === 'poor') reasons.push('sonno insufficiente');
    if (energy === 'low') reasons.push('energia bassa');
    if (soreness === 'high') reasons.push('affaticamento muscolare elevato');
    if (pain === 'present') return {
        level: 'stop', allowIncrease: false, avoidTechniques: true,
        reasons: [...reasons, 'dolore segnalato'],
        message: 'Dolore segnalato: interrompi il movimento che provoca dolore. ' +
            'Non utilizzare aumenti di carico o tecniche d’intensità per compensare. ' +
            'Se il dolore è importante, insolito o persiste, chiedi una valutazione professionale.'
    };
    if (reasons.length >= 2) return {
        level: 'caution', allowIncrease: false, avoidTechniques: true,
        reasons,
        message: 'Oggi risultano ' + reasons.join(' e ') + ': conserva la tecnica, ' +
            'rispetta recuperi adeguati ed evita incrementi e tecniche d’intensità. ' +
            'Se le prime serie risultano troppo impegnative, considera di ridurre ' +
            'il carico o il lavoro accessorio.'
    };
    if (reasons.length === 1) return {
        level: 'watch', allowIncrease: false, avoidTechniques: false,
        reasons,
        message: 'Segnale da monitorare (' + reasons[0] + '): mantieni carichi prudenti, ' +
            'non aumentare oggi e rivaluta dopo le prime serie effettive.'
    };
    return {
        level: 'normal', allowIncrease: true, avoidTechniques: false,
        reasons: [],
        message: 'Check-in regolare. Segui la scheda, valutando comunque tecnica, RPE e recupero dopo ogni serie.'
    };
}

export function createSessionCheckin(values, now = new Date()) {
    const checked = validateSessionCheckin(values);
    if (!checked.ok) throw new Error(checked.message);
    return { ...checked.data, checkedAt: now.toISOString() };
}

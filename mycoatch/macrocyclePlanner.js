/**
 * Pianificazione di un orizzonte di tre mesocicli: una ROADMAP, non tre
 * schede prescrittive create senza dati futuri.
 *
 * Non modifica lo storico e non interpreta RPE prescritti come misurati.
 * Il blocco seguente viene rivalutato solo dopo allenamenti confermati.
 */
const round = value => Math.round(value * 100) / 100;
const isConfirmed = set => set?.isLocked === true || set?.completed === true;
const isWorking = set => !set?.isWarmup && !set?.warmup && !set?.is_warmup;
const repsRecorded = set => {
    const raw = set?.actualReps ?? set?.reps;
    const text = String(raw ?? '').trim();
    return /^\d{1,3}$/.test(text) && Number(text) >= 1 && Number(text) <= 100;
};
const measuredRpe = value => {
    if (value === null || value === undefined || value === '') return false;
    const s = String(value).trim().replace(/^@/, '').replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(s) && Number(s) >= 6 && Number(s) <= 10;
};

function prescribedSets(ex) {
    const raw = ex?.setsCount ?? ex?.set;
    const n = raw === undefined || raw === null || String(raw).trim() === ''
        ? NaN : Number.parseInt(String(raw), 10);
    if (Number.isInteger(n) && n > 0 && n <= 30) return n;
    const planned = Array.isArray(ex?.sets) ? ex.sets.filter(isWorking).length : 0;
    return planned > 0 ? planned : null;
}

export function auditLatestBlock(mesocycle) {
    const weeks = Array.isArray(mesocycle?.weeks) ? mesocycle.weeks : [];
    let expected = 0, confirmed = 0, withRpe = 0, unknownPrescriptions = 0;
    let completedWeeks = 0, totalWeeks = 0, plannedDays = 0;
    for (const week of weeks) {
        const days = Array.isArray(week?.days) ? week.days : [];
        // Una settimana prevista ma senza giornate non equivale a una
        // settimana allenata: conservarla nel denominatore di completamento.
        totalWeeks++;
        if (!days.length) continue;
        let completeWeek = true;
        for (const day of days) {
            const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
            if (!exercises.length) {
                completeWeek = false;
                continue;
            }
            plannedDays++;
            for (const ex of exercises) {
                const planned = prescribedSets(ex);
                if (planned === null) {
                    unknownPrescriptions++;
                    completeWeek = false;
                    continue;
                }
                expected += planned;
                // Ultima seduta del giorno, non archivi di ripetizioni del giorno.
                const logged = Array.isArray(ex.loggedSets) ? ex.loggedSets :
                    (Array.isArray(ex.sets) ? ex.sets : []);
                const real = logged.filter(set =>
                    isWorking(set) && isConfirmed(set) && repsRecorded(set));
                const counted = Math.min(planned, real.length);
                confirmed += counted;
                withRpe += real.slice(0, counted)
                    .filter(set => measuredRpe(set.rpe)).length;
                if (counted < planned) completeWeek = false;
            }
        }
        if (completeWeek) completedWeeks++;
    }
    const hasPlan = totalWeeks > 0 && plannedDays > 0 &&
        expected > 0 && unknownPrescriptions === 0;
    return {
        weeksPlanned: totalWeeks,
        weeksCompleted: completedWeeks,
        setsPlanned: expected,
        setsConfirmed: confirmed,
        setsWithMeasuredRpe: withRpe,
        unknownPrescriptions,
        adherence: hasPlan ? round(confirmed / expected) : null,
        rpeCoverage: confirmed > 0 ? round(withRpe / confirmed) : null,
        completed: hasPlan && completedWeeks === totalWeeks
    };
}

const focusLabel = {
    strength: 'forza',
    hypertrophy: 'ipertrofia',
    hybrid: 'forza e ipertrofia'
};

function verifiedPreviousBlocks(userHistory) {
    const root = userHistory?.history || userHistory || {};
    const years = root.years || {};
    let checked = 0;
    let verified = 0;
    for (const year of Object.keys(years).sort((a, b) =>
        Number(a) - Number(b))) {
        for (const mesocycle of years[year]?.mesocycles || []) {
            if (!Array.isArray(mesocycle?.weeks)) continue;
            checked++;
            if (auditLatestBlock(mesocycle).completed) verified++;
        }
    }
    return { checked, verified };
}

function trajectory(report) {
    const values = Object.values(report.byExercise || {});
    const weeks = new Set();
    for (const ex of values) {
        for (const session of ex.exposures || []) {
            if (session.weekId && session.completedSets > 0) weeks.add(session.weekId);
        }
    }
    return {
        weeksWithConfirmedSets: weeks.size,
        progressingExercises: values.filter(ex => ex.status === 'progressing').length,
        stalledExercises: values.filter(ex => ex.status === 'possible_stall').length,
        exercisesWithRpeEvidence: values.filter(ex =>
            (ex.progressionEvidence?.distinctWeeks || 0) >= 2 &&
            ex.avgRpe !== null).length
    };
}

/**
 * Il piano futuro non deve attribuire kg, 1RM, crescita muscolare o RPE
 * misurati a settimane che l'atleta non ha ancora svolto.
 */
export function planMacrocycle(report = {}, config = {}, userHistory = null) {
    const weeksPerBlock = Number(config.durationWeeks ?? 4);
    if (!Number.isInteger(weeksPerBlock) ||
        weeksPerBlock < 1 || weeksPerBlock > 12) {
        throw new Error('Durata del mesociclo non valida (1-12 settimane).');
    }
    const goal = ['strength', 'hypertrophy', 'hybrid'].includes(config.focus)
        ? config.focus : 'hybrid';
    const priorityMuscle = config.athleteProfile?.priorityMuscle ||
        config.focusMuscleGroup || null;
    const latest = auditLatestBlock(report.lastMesocycle);
    const pastBlocks = verifiedPreviousBlocks(userHistory);
    const trend = trajectory(report);
    const fatigue = Object.values(report.byExercise || {}).filter(ex =>
        ex.fatigueConcern === true &&
        (ex.progressionEvidence?.distinctWeeks || 0) >= 2
    ).map(ex => ex.name);
    const anyConfirmed = Number(report.sessionsAnalyzed) > 0 ||
        trend.weeksWithConfirmedSets > 0;
    const latestIsUnfinished = latest.weeksPlanned > 0 && !latest.completed;
    const lowRpeCoverage = latest.setsConfirmed > 0 &&
        (latest.rpeCoverage === null || latest.rpeCoverage < 0.75);
    let readiness, firstRole, explanation;
    if (!anyConfirmed) {
        readiness = 'insufficient_history';
        firstRole = 'calibration';
        explanation = 'Non risultano sedute confermate: calibra senza inventare carichi.';
    } else if (fatigue.length) {
        readiness = 'recovery_review';
        firstRole = 'recovery_review';
        explanation = 'RPE sopra target in settimane distinte: valutare il recupero prima di intensificare.';
    } else if (latestIsUnfinished) {
        readiness = 'incomplete_previous_block';
        firstRole = 'continuity_review';
        explanation = 'Ultimo mesociclo non completato: non considerarlo concluso né avanzare automaticamente.';
    } else if (lowRpeCoverage || !latest.completed) {
        readiness = 'insufficient_validation';
        firstRole = 'consolidation';
        explanation = 'Dati insufficienti per validare un nuovo salto di intensità: consolidare e registrare RPE.';
    } else {
        readiness = 'ready_for_next_review';
        firstRole = 'development';
        explanation = 'Ultimo mesociclo completato: una nuova proposta è valutabile, senza carichi futuri predeterminati.';
    }

    const labels = {
        calibration: 'Calibrazione iniziale',
        recovery_review: 'Recupero e rivalutazione',
        continuity_review: 'Continuità del blocco incompleto',
        consolidation: 'Consolidamento dei risultati',
        development: 'Sviluppo progressivo',
        reassessment: 'Rivalutazione e specializzazione',
        maintenance: 'Consolidamento e gestione della fatica'
    };
    // Le fasi avanzano soltanto dopo blocchi verificati e solo quando
    // il contesto presente e' adatto. Nessun avanzamento per pianificazioni
    // vuote, non concluse o sessioni replicate nello stesso microciclo.
    const sequence = ['development', 'reassessment', 'maintenance'];
    const position = pastBlocks.verified % sequence.length;
    const roles = readiness === 'ready_for_next_review'
        ? [0, 1, 2].map(i => sequence[(position + i) % sequence.length])
        : [firstRole, sequence[position], sequence[(position + 1) % sequence.length]];
    const blocks = roles.map((role, i) => ({
        order: i + 1,
        weekFrom: i * weeksPerBlock + 1,
        weekTo: (i + 1) * weeksPerBlock,
        durationWeeks: weeksPerBlock,
        role,
        label: labels[role],
        objective: focusLabel[goal],
        priorityMuscle,
        conditional: i !== 0,
        noPredictedLoads: true,
        reviewBeforeStart: i !== 0 || readiness !== 'ready_for_next_review',
        reviewCriteria: [
            'sedute e serie realmente confermate',
            'aderenza e RPE misurato',
            'progressione di ripetizioni e carichi confrontabili',
            'rispetto dei tempi e tolleranza al volume'
        ]
    }));
    return {
        version: 1,
        scope: 'conditional_roadmap_not_autonomous_prescription',
        durationWeeks: weeksPerBlock * blocks.length,
        goal,
        priorityMuscle,
        readiness,
        explanation,
        lastBlock: latest,
        longitudinal: trend,
        completedHistoricalBlocks: pastBlocks.verified,
        inspectedHistoricalBlocks: pastBlocks.checked,
        cyclePosition: position + 1,
        recoverySignals: fatigue,
        blocks,
        safety: 'I blocchi 2 e 3 sono ipotesi, da riprogrammare dopo i dati reali; nessuna modifica dello storico.'
    };
}

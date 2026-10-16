import { canonicalExerciseKey } from './exerciseIdentity.js';

function prescribedSets(exercise) {
    return Number.parseInt(String(exercise?.set || exercise?.setsCount || ''), 10) ||
        exercise?.loggedSets?.length || exercise?.sets?.length || null;
}

function normalizedPrevious(meso) {
    const weeks = Array.isArray(meso?.weeks) ? meso.weeks : [];
    // Prendi l'ultima settimana operativa, evitando scarichi programmati.
    const main = [...weeks].reverse().find(week =>
        (week.days || []).some(day => (day.exercises || []).some(ex => {
            const rpe = Number(String(ex.targetRpe || ex.rpe || '').replace('@', '').replace(',', '.'));
            return rpe > 6.5;
        }))) || weeks.at(-1);
    const results = new Map();
    for (const day of (main?.days || [])) {
        for (const ex of (day.exercises || [])) {
            const key = `${day.dayNumber}:${canonicalExerciseKey(ex.name)}`;
            results.set(key, {
                name: ex.name, sets: prescribedSets(ex), reps: ex.reps,
                kg: ex.kgMin ?? '', rpe: ex.rpe
            });
        }
    }
    return results;
}

export function compareMesocyclePlans(previous, generated, analysis) {
    const before = normalizedPrevious(previous);
    const after = generated?.weeks?.[0]?.days || [];
    const changes = [];
    const matched = new Set();

    for (const day of after) {
        for (const ex of day.exercises || []) {
            const key = `${day.dayNumber}:${canonicalExerciseKey(ex.name)}`;
            matched.add(key);
            const old = before.get(key);
            const decision = analysis?.decisions?.byExercise?.[canonicalExerciseKey(ex.name)];
            const now = {
                sets: ex.setsCount, reps: ex.reps,
                kg: ex.kgMin || null, rpe: ex.rpe
            };
            const numericKg = value => {
                const n = Number(String(value ?? '').replace(/kg/gi, '').replace(',', '.').trim());
                return String(value ?? '').trim() ? (Number.isFinite(n) ? n : String(value)) : null;
            };
            if (!old || old.sets !== now.sets || String(old.reps) !== String(now.reps) ||
                numericKg(old.kg) !== numericKg(now.kg) ||
                String(old.rpe ?? '') !== String(now.rpe ?? '')) {
                changes.push({
                    day: day.dayNumber,
                    exercise: ex.name,
                    kind: old ? 'modified' : 'added',
                    previous: old || null,
                    proposed: now,
                    explanation: decision?.reason ||
                        'Selezione/serie adattate al template e alla durata disponibile.'
                });
            }
        }
    }

    for (const [key, old] of before.entries()) {
        if (!matched.has(key)) {
            changes.push({
                day: Number(key.split(':')[0]),
                exercise: old.name,
                kind: 'removed',
                previous: old,
                proposed: null,
                explanation: 'Non presente nella prima settimana proposta: verificare volume complessivo e alternative.'
            });
        }
    }

    return {
        basedOnPrevious: Boolean(previous),
        previousName: previous?.name || null,
        estimatedMinutesByDay: after.map(day => ({
            day: day.dayNumber, minutes: day.estimatedMinutes
        })),
        changes,
        adaptations: analysis?.decisions?.summary || [],
        // Non confondere il volume originale stimato con il volume davvero
        // programmato. Sono conteggi per categoria primaria dell'esercizio.
        weeklyVolume: generated?.weeks?.[0]?.volumeBalance || null,
        weeklyCoverage: generated?.weeks?.[0]?.weeklyCoverage || null,
        timeAwareSelections: after.map(day=>({
            day:day.dayNumber,
            protected:day.selectionAudit?.protected || [],
            selected:day.selectionAudit?.selectedAccessories || [],
            excluded:day.selectionAudit?.excludedAccessories || [],
            minutes:day.estimatedMinutes
        })),
        unavailableOptionalSlots: generated?.weeks?.[0]?.optionalSlotsNotAvailable || [],
        warnings: after.flatMap(day => {
            const warnings = [];
            if (day.reducedPrioritySets > 0) {
                warnings.push('Giorno ' + day.dayNumber + ': per rispettare il tempo sono state ridotte ' +
                    day.reducedPrioritySets + ' serie dei movimenti prioritari, senza eliminare i fondamentali. ' +
                    'Valuta più minuti se vuoi recuperare il volume previsto.');
            }
            if (day.reducedAccessorySets || day.removedAccessoryExercises) {
                warnings.push(`Giorno ${day.dayNumber}: per il limite di tempo sono state inizialmente ridotte ${day.reducedAccessorySets} serie accessorie e rimossi ${day.removedAccessoryExercises} esercizi. Le serie eventualmente recuperate negli altri giorni sono indicate nel bilancio settimanale.`);
            }
            return warnings;
        })
    };
}

/**
 * Testo compatto da mostrare come conferma prima del download.
 * Il CSV mantiene lo schema a 12 colonne.
 */
export function formatCoachReview(comparison, report) {
    const lines = ['MYCOATCH — ANTEPRIMA DELLA PROPOSTA'];
    lines.push(`Storico analizzato: ${report.inspectedMesocycles} mesocicli, ${report.sessionsAnalyzed} sedute con serie confermate.`);
    if (!comparison.basedOnPrevious) {
        lines.push('Nessun mesociclo precedente disponibile: non sono possibili adattamenti personali dallo storico.');
    }
    if (report.macrocycle) {
        const m = report.macrocycle;
        lines.push('MACROCICLO MYCOATCH: orizzonte di ' + m.durationWeeks +
            ' settimane, obiettivo ' + (m.goal === 'strength' ? 'forza' :
                m.goal === 'hypertrophy' ? 'ipertrofia' : 'forza e ipertrofia') + '.');
        lines.push('Verifica ultimo blocco: ' + m.lastBlock.weeksCompleted +
            '/' + m.lastBlock.weeksPlanned + ' settimane completate' +
            (m.lastBlock.adherence !== null
                ? ', aderenza osservata ' + Math.round(m.lastBlock.adherence * 100) + '%' : '') +
            '. ' + m.explanation);
        for (const block of m.blocks) {
            lines.push('Blocco ' + block.order + ' (settimane ' + block.weekFrom +
                '-' + block.weekTo + '): ' + block.label +
                (block.conditional ? ' — SOLO IPOTESI, da aggiornare con lo storico reale.' : '.'));
        }
        lines.push('NESSUNA PROGRESSIONE FUTURA PREAUTORIZZATA: i blocchi successivi ' +
            'richiedono nuove sedute confermate e una valutazione di carichi, RPE e recupero.');
    }
    if (report.progressionQuality) {
        const q = report.progressionQuality;
        lines.push('PROGRESSIONE FONDATA SUI DATI: ' +
            q.proposedLoadIncreases + ' piccoli incrementi di carico, ' +
            q.proposedRepSteps + ' obiettivi di ripetizioni, ' +
            q.recoveryWarnings + ' revisioni prudenziali per la fatica.');
        if (q.needsRealRpe.length) {
            lines.push('RPE insufficienti o sforzo oltre target: NON aumentare automaticamente ' +
                'per ' + q.needsRealRpe.slice(0, 4).join(', ') +
                (q.needsRealRpe.length > 4 ? ' (e altri esercizi)' : '') +
                '. Registra l’RPE reale e mantieni tecnica e recupero.');
        }
        lines.push('Gli incrementi di carico sono proposte, non modifiche ai risultati ' +
            'delle sedute già eseguite. Verifica i microcarichi disponibili.');
    }
    if (report.calibrationHandoff) {
        const calibration = report.calibrationHandoff;
        lines.push('PASSAGGIO DALLA CALIBRAZIONE: ' +
            calibration.completeDays + '/' + calibration.days +
            ' giornate complete · ' +
            calibration.anchorsRecorded + '/' + calibration.anchorsTotal +
            ' movimenti cardine registrati · ' +
            calibration.validSets + '/' + calibration.totalSets +
            ' serie reali valide.');
        if (!calibration.readyForReview) {
            lines.push('ATTENZIONE: settimana di calibrazione NON completata. ' +
                'La proposta è preliminare, utilizza solo i risultati finora confermati ' +
                'e non sostituisce automaticamente il programma attivo.');
            if (calibration.missingAnchors.length) {
                lines.push('Riferimenti mancanti: ' +
                    calibration.missingAnchors.join(', ') + '.');
            }
        } else {
            lines.push('Calibrazione della prima settimana registrata: ' +
                'puoi confrontare la nuova proposta con i risultati reali. ' +
                'La prima settimana completa NON significa che le settimane restanti ' +
                'del mesociclo siano state completate.');
        }
        if (calibration.withoutRpe > 0) {
            lines.push('RPE non registrato in ' + calibration.withoutRpe +
                ' serie: non sono consentite stime di fatica o e1RM ' +
                'basate su quei valori mancanti.');
        }
        lines.push('Decidi tu se scaricare e importare un nuovo CSV: ' +
            'nessun allenamento esistente viene aggiornato da MyCoatch.');
    }
    if (report.athleteOnboarding) {
        const profile = report.athleteOnboarding;
        lines.push('PROFILO INIZIALE: ' + profile.level +
            (profile.priorityMuscle ? ' · priorità ' + profile.priorityMuscle : ' · sviluppo equilibrato') + '.');
        if (profile.calibrationWeek) {
            lines.push('PRIMA SETTIMANA DI CALIBRAZIONE: RPE iniziale moderato, serie controllate, nessun massimale o carico inventato. Registra le serie reali per il successivo adattamento.');
        } else if (report.sessionsAnalyzed > 0) {
            lines.push('Storico disponibile: la calibrazione iniziale non sostituisce le prestazioni già registrate.');
        }
        if (profile.excludedExercises.length) {
            lines.push('Esercizi esclusi dall’atleta: ' + profile.excludedExercises.join(', ') + '.');
        }
        if (profile.referencesProvided.length) {
            lines.push('Carichi dichiarati, NON verificati nel diario: ' +
                profile.referencesProvided.join(', ') +
                '. Se incompatibili con il target/RPE, i kg restano da definire.');
        }
    }
    if (comparison.weeklyCoverage) {
        const coverage = comparison.weeklyCoverage;
        if (coverage.fractionalVolumeByMuscle) {
            const relevant = Object.entries(coverage.fractionalVolumeByMuscle)
                .filter(([, v]) => v.indirectSetCredits > 0)
                .sort((a, b) => b[1].indirectSetCredits - a[1].indirectSetCredits)
                .slice(0, 5);
            if (relevant.length) {
                lines.push('VOLUME MUSCOLARE FRAZIONARIO — settimane proposte (serie dirette + 0,5 per coinvolgimento secondario; stima NON misurazione di crescita):');
                lines.push(relevant.map(([muscle, v]) => muscle + ': ' +
                    v.directSets + ' dirette + ' +
                    v.indirectSetCredits + ' crediti indiretti = ' +
                    v.fractionalSets).join(' · '));
            }
        }
        lines.push('Split programmato: ' + coverage.daysOrder.join(' → ') +
            ' (giorni numerati, non appuntamenti fissati in calendario).');
        lines.push('Movimenti cardine: ' + coverage.anchors
            .map(x => `G${x.dayNumber} ${x.exercise || x.lift + ' NON PRESENTE'}`).join(' · '));
        if (!coverage.allPriorityLiftsPresent) {
            lines.push('ATTENZIONE: un fondamentale prioritario non è stato conservato.');
        }
        if (coverage.notDirectlyCovered.length) {
            lines.push('Gruppi senza serie DIRETTE nella prima settimana: ' +
                coverage.notDirectlyCovered.join(', ') +
                '. Un contributo indiretto non viene contato come serie diretta.');
        }
    }
    if (comparison.unavailableOptionalSlots.length) {
        lines.push('Accessori facoltativi esclusi per attrezzatura: ' +
            comparison.unavailableOptionalSlots
                .map(x => `G${x.dayNumber} ${x.muscle} (${x.pattern})`).join(', ') + '.');
    }
    lines.push('Durate previste (stime): ' + comparison.estimatedMinutesByDay
        .map(d => `G${d.day} ${d.minutes} min`).join(' · '));

    if (comparison.timeAwareSelections?.length) {
        lines.push('SCELTA INIZIALE ESERCIZI IN BASE AL TEMPO (stime, prima dell’eventuale recupero settimanale degli accessori):');
        for (const plan of comparison.timeAwareSelections) {
            const chosen=plan.selected.slice(0, 4)
                .map(item=>item.exercise+' ('+item.reason+')').join(' · ');
            const excluded=plan.excluded.slice(0,3).map(item=>item.exercise);
            lines.push('G'+plan.day+': '+plan.protected.length+
                ' movimenti prioritari protetti; '+
                (chosen || 'nessun accessorio aggiunto oltre i fondamentali')+
                (excluded.length ? '; non inseriti: '+excluded.join(', ')+
                    (plan.excluded.length>excluded.length ? ' e altri' : '')+
                    ' (priorità e minuti disponibili)' : '')+'.');
        }
    }
    for (const a of comparison.adaptations.slice(0, 5)) {
        lines.push(`• ${a.target}: ${a.reason}`);
    }
    const volume = comparison.weeklyVolume;
    if (volume) {
        lines.push(`Bilancio volume prima settimana: ${volume.scheduledSets}/${volume.plannedSets} serie programmate (conteggio per gruppo primario), ${volume.recoveredSets} recuperate su altri giorni.`);
        for (const move of (volume.moves || []).slice(0, 4)) {
            lines.push(`• G${move.fromDay} → G${move.toDay}: ${move.sets} serie ${move.muscle} (${move.targetExercise}).`);
        }
        if (volume.shortfallSets) {
            const missed = Object.entries(volume.byMuscle || {})
                .filter(([, values]) => values.shortfallSets > 0)
                .map(([muscle, values]) => `${muscle}: -${values.shortfallSets}`)
                .join(', ');
            lines.push(`Attenzione: restano ${volume.shortfallSets} serie sotto il template iniziale (${missed}). Tempo troppo breve per recuperarle senza compromettere le priorità.`);
        }
        if (volume.missingCompoundExercises?.length) {
            lines.push('ATTENZIONE FONDAMENTALI: il tempo scelto ha escluso questi multiarticolari: ' +
                volume.missingCompoundExercises
                    .map(ex => `G${ex.day} ${ex.exercise}`).join(', ') +
                '. Valuta più minuti o più giorni di allenamento.');
        }
    }
    lines.push(`Confronto vecchio/nuovo: ${comparison.changes.length} modifiche nella prima settimana.`);
    for (const c of comparison.changes.slice(0, 6)) {
        const format = info => info ?
            `${info.sets ?? '?'}×${info.reps ?? '?'} ${info.kg ? '@' + info.kg + 'kg' : '(carico non noto)'}` :
            'non presente';
        lines.push(`G${c.day} · ${c.exercise}: ${format(c.previous)} → ${format(c.proposed)}`);
    }
    for (const warning of comparison.warnings.slice(0, 4)) lines.push('Attenzione: ' + warning);
    lines.push('', 'Le decisioni si basano su stime e sullo storico, non su misure dirette di crescita muscolare.');
    lines.push('Confermi la proposta e vuoi scaricare il CSV?');
    return lines.join('\n');
}

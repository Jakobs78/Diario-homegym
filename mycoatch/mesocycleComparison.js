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
        coachGuardrails:generated?.coachGuardrails || null,
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
function italianMuscleName(key) {
    const names={Back_Lats:'Dorsali (trazioni e lat machine)',Back_Thickness:'Dorso (rematori e tirate orizzontali)',Core:'Addome e stabilizzatori del tronco'};
    return names[key] || key;
}
function italianCoverageStatus(value) {
    switch(value) {
        case 'not_programmed': return 'nessun esercizio diretto previsto';
        case 'omitted_after_optimization': return 'esercizio tolto per rispettare la durata';
        case 'reduced_after_optimization': return 'meno serie del previsto per rispettare la durata';
        default: return 'stato non disponibile';
    }
}

export function formatCoachReview(comparison, report) {
    const lines = ['MYCOATCH — PERCHÉ È STATA PROPOSTA QUESTA SCHEDA'];
    lines.push(`Dati usati per personalizzare il piano: ${report.inspectedMesocycles} ${report.inspectedMesocycles === 1 ? 'mesociclo precedente' : 'mesocicli precedenti'} e ${report.sessionsAnalyzed} ${report.sessionsAnalyzed === 1 ? 'seduta' : 'sedute'} con serie effettivamente confermate. Le serie solo precompilate non contano come allenamenti eseguiti.`);
    if (report.closureHandoff) {
        const h = report.closureHandoff, r = h.review;
        lines.push('Programma di partenza scelto per il confronto: "' + h.name +
            '" (' + h.year + ', posizione ' + (h.index + 1) + ').');
        lines.push('Risultati reali del blocco: ' + r.completedSessions + '/' +
            r.plannedSessions + ' sedute complete, ' + r.partialSessions +
            ' parziali, ' + r.skippedSessions + ' non iniziate; ' +
            r.completedSets + '/' + r.plannedSets + ' serie confermate valide.');
        lines.push('RPE realmente misurati: ' + r.measuredRpeSets + '/' +
            r.completedSets + (r.averageRpe === null ? ' (media non disponibile).' :
                ' (media ' + r.averageRpe + ').'));
        if (r.status !== 'complete') lines.push('ATTENZIONE: chiusura anticipata o dati incompleti. ' +
            'Non dedurre miglioramenti dalle sedute mancanti.');
        lines.push('Continuità esercizi e confronto vecchio/nuovo ancorati a questo blocco; ' +
            'carichi, stalli e fatica sono analizzati separatamente sui dati recenti confermati.');
    }
    if(report.recency){
        const r=report.recency;
        lines.push(`Storico operativo: ${r.startYear}–${r.endYear}. Per i carichi attuali: solo serie datate degli ultimi ${r.windowDays} giorni.`);
        if(r.reentry)lines.push('RIENTRO DOPO PAUSA: nuova calibrazione, senza riutilizzare automaticamente i vecchi carichi.');
        if(r.undatedSets || r.excludedOldSets || r.futureSets)
            lines.push(`Dati esclusi dalle progressioni: ${r.undatedSets} serie senza data, ${r.excludedOldSets} troppo vecchie, ${r.futureSets} con data futura. Restano nel diario e nei backup.`);
    }
    if (comparison.coachGuardrails) {
        const guard = comparison.coachGuardrails;
        lines.push('CRITERIO DI SICUREZZA: MyCoatch non aumenta carichi e intensità su semplice richiesta. Verifica prima risultati registrati, sforzo percepito e recupero.');
        for (const decision of guard.reasons || []) {
            lines.push('[' + decision.decision + '] ' + decision.reason +
                (decision.exercises?.length ? ' Esercizi: ' +
                    decision.exercises.slice(0,4).join(', ') + '.' : ''));
        }
        lines.push('Evidenze riesaminate il ' +
            guard.evidenceSnapshot + ': fonti peer reviewed, non aggiornamento automatico in tempo reale.');
    }
    if (!comparison.basedOnPrevious) {
        lines.push('Nessun mesociclo precedente disponibile: non sono possibili adattamenti personali dallo storico.');
    }
    if (report.macrocycle) {
        const m = report.macrocycle;
        lines.push('PIANO DI LUNGO PERIODO (MACROCICLO): percorso ipotizzato di ' + m.durationWeeks +
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
        lines.push('POSSIBILI PROGRESSIONI IN BASE ALLE SEDUTE REGISTRATE: ' +
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
    if (report.blockResponses?.length) {
        lines.push('RISPOSTA TRA MESOCICLI (osservazione, non prova di causalità):');
        for (const r of report.blockResponses.slice(0, 5)) {
            const label = r.status === 'improved' ? 'miglioramento' :
                r.status === 'declined' ? 'calo' : 'stabile';
            lines.push(r.exercise + ': ' + label + ' (' +
                (r.deltaReps > 0 ? '+' : '') + r.deltaReps +
                ' ripetizioni minime medie, a carico e target comparabili).');
        }
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
                lines.push('COME È DISTRIBUITO IL LAVORO TRA I MUSCOLI: una serie conta 1 per il muscolo principale e, per convenzione, 0,5 per un muscolo che collabora. Sono crediti di conteggio, NON serie aggiuntive da eseguire né una misura della crescita:');
                lines.push(relevant.map(([muscle, v]) => italianMuscleName(muscle) + ': ' +
                    v.directSets + ' dirette + ' +
                    v.indirectSetCredits + ' crediti stimati da esercizi multiarticolari = ' +
                    v.fractionalSets).join(' · '));
            }
        }
        lines.push('Suddivisione delle sedute (split): ' + coverage.daysOrder.join(' → ') +
            ' (giorni numerati, non appuntamenti fissati in calendario).');
        lines.push('Esercizi principali su cui MyCoatch costruisce la progressione: ' + coverage.anchors
            .map(x => `G${x.dayNumber} ${x.exercise || x.lift + ' NON PRESENTE'}`).join(' · '));
        if (!coverage.allPriorityLiftsPresent) {
            lines.push('ATTENZIONE: un fondamentale prioritario non è stato conservato.');
        }
        if (coverage.notDirectlyCovered.length) {
            lines.push('Gruppi senza un esercizio dedicato nella prima settimana: ' +
                coverage.notDirectlyCovered.join(', ') +
                '. Possono comunque lavorare in altri movimenti, ma ciò non equivale a un esercizio specifico.');
        }
        // These metrics were already calculated but never shown in the
        // athlete's approval dialog. Surface meaningful functional gaps
        // before downloading; don't force extra volume or claim zero
        // stimulus from rows/presses when isolated rear work is absent.
        const functional=Object.values(coverage.functionalCoverage || {});
        const gaps=functional.filter(item=>
            item.status==='not_programmed' ||
            item.status==='omitted_after_optimization' ||
            item.status==='reduced_after_optimization');
        if(gaps.length){
            lines.push('MOVIMENTI SPECIFICI DA CONTROLLARE PRIMA DI ACCETTARE: ' +
                gaps.map(item=>item.label + ': ' + item.scheduledSets +
                    ' serie dirette' + (item.plannedSets === null ? '' :
                    ' su ' + item.plannedSets + ' previste') +
                    ' (' + italianCoverageStatus(item.status) + ')').join(' · ') +
                '. Un esercizio per un altro distretto può coinvolgerli indirettamente: questo avviso non dimostra assenza di stimolo né crescita insufficiente.');
        }
        if(coverage.shoulderHeadCoverage){
            const heads=coverage.shoulderHeadCoverage.directIsolationSets;
            lines.push('SPALLE: lavoro mirato per il deltoide laterale ' +
                heads.laterale + ' serie, per il deltoide posteriore ' + heads.posteriore +
                ' serie. Spinte sopra la testa ' +
                coverage.shoulderHeadCoverage.verticalPressSets +
                ' serie (allenano le spalle, ma non sostituiscono un esercizio mirato al deltoide posteriore).');
        }
    }
    if (comparison.unavailableOptionalSlots.length) {
        lines.push('Esercizi complementari non inseriti perché manca l’attrezzatura dichiarata: ' +
            comparison.unavailableOptionalSlots
                .map(x => `G${x.dayNumber} ${x.muscle} (${x.pattern})`).join(', ') + '.');
    }
    lines.push('Tempo indicativo per ogni seduta, incluso il riscaldamento (non misurato): ' + comparison.estimatedMinutesByDay
        .map(d => `G${d.day} ${d.minutes} min`).join(' · '));

    if (comparison.timeAwareSelections?.length) {
        lines.push('COME SONO STATI SCELTI GLI ESERCIZI PER RISPETTARE IL TEMPO: MyCoatch conserva anzitutto gli esercizi principali e inserisce i complementari più utili finché resta spazio. Può spostare alcune serie in un altro giorno:');
        for (const plan of comparison.timeAwareSelections) {
            const chosen=plan.selected.slice(0, 4)
                .map(item=>item.exercise+' ('+item.reason+')').join(' · ');
            const excluded=plan.excluded.slice(0,3).map(item=>item.exercise);
            lines.push('G'+plan.day+': '+plan.protected.length+
                ' esercizi principali mantenuti; '+
                (chosen || 'nessun complementare aggiunto oltre gli esercizi principali')+
                (excluded.length ? '; non inseriti: '+excluded.join(', ')+
                    (plan.excluded.length>excluded.length ? ' e altri' : '')+
                    ' (in base al tempo a disposizione)' : '')+'.');
        }
    }
    for (const a of comparison.adaptations.slice(0, 5)) {
        lines.push(`• ${a.target}: ${a.reason}`);
    }
    const volume = comparison.weeklyVolume;
    if (volume) {
        lines.push(`Controllo delle serie nella prima settimana: ${volume.scheduledSets}/${volume.plannedSets} serie effettivamente inserite rispetto al programma iniziale (ogni serie è assegnata al suo muscolo principale), ${volume.recoveredSets} spostate o recuperate su altre sedute.`);
        for (const move of (volume.moves || []).slice(0, 4)) {
            lines.push(`• G${move.fromDay} → G${move.toDay}: ${move.sets} serie ${move.muscle} (${move.targetExercise}).`);
        }
        if (volume.shortfallSets) {
            const missed = Object.entries(volume.byMuscle || {})
                .filter(([, values]) => values.shortfallSets > 0)
                .map(([muscle, values]) => `${italianMuscleName(muscle)}: -${values.shortfallSets}`)
                .join(', ');
            lines.push(`Attenzione: per rispettare il tempo sono state eliminate ${volume.shortfallSets} serie rispetto alla proposta iniziale (${missed}). Per recuperarle sarebbe necessario aumentare la durata o rivedere le priorità, non aggiungerle senza considerare la fatica.`);
        }
        if (volume.missingCompoundExercises?.length) {
            lines.push('ATTENZIONE: il tempo scelto non ha consentito di mantenere questi esercizi principali: ' +
                volume.missingCompoundExercises
                    .map(ex => `G${ex.day} ${ex.exercise}`).join(', ') +
                '. Valuta più minuti o più giorni di allenamento.');
        }
    }
    lines.push(`Differenze rispetto al programma di confronto: ${comparison.changes.length} modifiche nella prima settimana. Sono prescrizioni nuove, non modifiche alle prestazioni già registrate.`);
    for (const c of comparison.changes.slice(0, 6)) {
        const format = info => info ?
            `${info.sets ?? '?'}×${info.reps ?? '?'} ${info.kg ? '@' + info.kg + 'kg' : '(carico non noto)'}` :
            'non presente';
        lines.push(`G${c.day} · ${c.exercise}: ${format(c.previous)} → ${format(c.proposed)}`);
    }
    for (const warning of comparison.warnings.slice(0, 4)) lines.push('Attenzione: ' + warning);
    lines.push('', 'COME USARE QUESTO REPORT: verifica che attrezzatura, giorni, serie, recuperi e intensità siano realistici. RPE significa fatica percepita su una scala da 1 a 10: per esempio RPE 8 corrisponde a circa due ripetizioni ancora possibili. Le scelte di MyCoatch si basano su stime e sullo storico, non misurano direttamente crescita o recupero.');
    lines.push('Vuoi scaricare soltanto il file CSV? Il download NON importa la scheda nel diario e NON sostituisce i risultati precedenti.');
    return lines.join('\n');
}


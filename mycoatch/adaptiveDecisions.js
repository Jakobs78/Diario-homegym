/**
 * Decisioni conservative e spiegabili. Nessuna diagnosi di crescita muscolare:
 * kg, reps, volume e RPE descrivono prestazione, stimolo e tolleranza al lavoro.
 */
import { getAvailableLoadStep, resolvePlannedLoad } from './loadProposal.js';
const roundLoad = kg => Math.max(0, Math.round(kg * 4) / 4);

export function planAdaptiveDecisions(report,{loadingSteps={}}={}) {
    const byExercise = {};
    const byMuscle = {};
    const summary = [];

    for (const [key, exercise] of Object.entries(report.byExercise || {})) {
        // Apply a historical WORKING-set load, never the heaviest top set
        // to every back-off set. The top load is retained for reporting.
        const kg = exercise.lastWorkingKg ?? exercise.lastKg;
        let action = 'maintain';
        let plannedKg = kg;
        let plannedRepGoal = null;
        let reason = exercise.status === 'insufficient_data'
            ? 'Storico confermato insufficiente: nessuna progressione automatica del carico.'
            : 'Mantieni il carico precedente e monitora la prossima esposizione.';

        if (exercise.fatigueConcern && kg !== null) {
            action = 'reduce_load';
            // Use the athlete's actual loading increment, and never suggest
            // a reduction whose physical load is unavailable. A fatigue
            // signal is not permission to invent smaller plates or dumbbells.
            const {step}=getAvailableLoadStep(exercise,loadingSteps,kg);
            const candidate=roundLoad(Math.max(kg * 0.95,kg-step));
            const resolved=resolvePlannedLoad(exercise,candidate,loadingSteps);
            if(resolved.weight !== null && resolved.weight < kg) {
                plannedKg=resolved.weight;
                reason='RPE realmente elevato in esposizioni confrontabili: valuta un alleggerimento componibile e il recupero prima della prossima seduta.';
            } else {
                action='review_recovery';
                plannedKg=kg;
                reason='Segnali ripetuti di fatica: il carico inferiore non risulta componibile o sarebbe identico. Non inventare dischi; rivaluta recupero e prescrizione.';
            }
        } else if (exercise.readyForLoad && kg !== null &&
                   exercise.status !== 'regressing') {
            const increment = getAvailableLoadStep(exercise,loadingSteps,kg).step;
            if (increment / kg <= 0.10) {
                action = 'increase_load';
                plannedKg = roundLoad(kg + increment);
                reason = exercise.progressionEvidence?.progressionTrigger === 'low_rpe'
                    ? 'Due settimane diverse: tutte le serie confermate entro il range di ripetizioni con RPE almeno 1 punto sotto il target. Incremento minimo proporzionato al carico e alla tua attrezzatura.'
                    : 'Due settimane diverse, tutte le serie al limite alto delle ripetizioni con RPE entro target. Piccolo incremento proposto (verifica i pesi disponibili).';
            } else {
                reason = 'Le due settimane giustificano una progressione, ma il passo minimo standard sarebbe superiore al 10% del carico: mantieni i kg oppure usa microcarichi realmente disponibili.';
            }
        } else if (exercise.status === 'possible_stall' && !exercise.readyForReps) {
            action = 'review_stall';
            reason = 'Possibile stallo della prestazione: conferma tecnica, sonno, pause e andamento dei carichi prima di ruotare esercizio o alzare il volume.';
        } else if (exercise.status === 'regressing') {
            action = 'review_regression';
            reason = 'e1RM in calo, ma dati non sufficienti per attribuirlo alla fatica: mantieni e osserva la seduta seguente.';
        } else if (exercise.progressionEvidence?.repeatedBelowMin && kg !== null) {
            action = 'review_missed_reps';
            reason = 'Due settimane con ripetizioni sotto il minimo previsto: ' +
                'verifica tecnica, recupero e adeguatezza del target. ' +
                'Senza RPE alto confermato non attribuiamo il calo alla fatica ' +
                'e non riduciamo automaticamente i kg.';
        } else if (exercise.readyForReps && kg !== null) {
            action = 'build_reps';
            plannedRepGoal = exercise.nextRepTarget;
            reason = 'Due settimane complete con RPE misurato entro il target: mantieni ' +
                kg + ' kg e prova ' + plannedRepGoal +
                ' ripetizioni in una serie, senza forzare cedimento o tecnica. ' +
                'Aumenta i kg solo dopo avere consolidato tutte le serie al limite alto.';
        } else if (exercise.status === 'progressing') {
            action = 'maintain_progression';
            reason = 'Forza stimata in miglioramento: conserva il movimento e progredisci solo quando reps e RPE lo consentono.';
        }

        if(action==='increase_load' && resolvePlannedLoad(exercise,plannedKg,loadingSteps).weight===null){
            action='maintain';plannedKg=kg;
            reason='Le prestazioni consentono una progressione, ma i dischi disponibili non compongono il carico proposto. Mantieni i kg e riconferma ripetizioni e RPE.';
        }

        byExercise[key] = {
            exercise: exercise.name,
            action,
            lastKg: exercise.lastKg,
            workingKg: kg,
            plannedKg,
            plannedRepGoal,
            evidenceWeeks: exercise.progressionEvidence?.evidenceWeeks || [],
            caveats: exercise.progressionEvidence?.caveats || [],
            status: exercise.status,
            rpe: exercise.avgRpe,
            reason,
            confidence: (exercise.progressionEvidence?.distinctWeeks || 0) >= 3 &&
                exercise.avgRpe !== null ? 'moderate' : 'low'
        };
        if (action !== 'maintain' && action !== 'maintain_progression')
            summary.push({ target: exercise.name, action, reason });
    }

    for (const [muscle, metrics] of Object.entries(report.byMuscle || {})) {
        const relevant = (metrics.exerciseKeys || [])
            .map(key => report.byExercise[key]).filter(Boolean);
        const highFatigue = relevant.some(ex => ex.fatigueConcern);
        const plateau = relevant.some(ex =>
            ex.status === 'possible_stall' &&
            !ex.readyForLoad && !ex.readyForReps);
        // If double progression is already authorized (reps OR kg), avoid
        // adding accessory volume in the same stall-response decision.
        const enoughWeeks = metrics.weeksObserved >= 3;
        const adherence = metrics.recentAdherence;
        const fractional = metrics.avgWeeklyFractionalSets;
        // Soglia <9 ereditata dal precedente criterio di incremento
        // CONSERVATIVO, non un limite fisiologico validato. Includere i
        // contributi indiretti evita +1 serie quando il carico reale dello
        // stesso gruppo e' gia' consistente.
        const tentativeVolume = fractional ?? metrics.avgWeeklySets;
        const rpeCoverageSufficient = metrics.fractionalRpeCoverage === undefined ||
            metrics.fractionalRpeCoverage >= 0.75;
        let volumeDelta = 0;
        let action = 'maintain_volume';
        let reason = 'Mantieni il volume: risultati insufficienti per una modifica sicura.';

        if (enoughWeeks && highFatigue && metrics.avgRpe !== null &&
            metrics.avgRpe >= 8.8) {
            volumeDelta = -1;
            action = 'reduce_accessory_volume';
            reason = 'RPE recente alto e segnali ripetuti di fatica: proponi una serie accessoria in meno nel prossimo blocco.';
        } else if (enoughWeeks && plateau && !highFatigue &&
            adherence !== null && adherence >= 0.85 &&
            metrics.avgRpe !== null && metrics.avgRpe <= 7.5 &&
            metrics.avgWeeklySets >= 3 && tentativeVolume < 9 &&
            rpeCoverageSufficient) {
            volumeDelta = 1;
            action = 'trial_accessory_volume';
            reason = 'Possibile stallo con buona aderenza, RPE registrati e stimolo frazionario moderato: prova una sola serie accessoria aggiuntiva, rispettando il tempo disponibile.';
        } else if (enoughWeeks && plateau && fractional !== undefined &&
            fractional >= 9 && metrics.avgWeeklySets < 9) {
            reason = 'Lo stallo non dimostra bisogno di piu serie: il lavoro secondario porta gia il volume stimato sopra la soglia prudenziale di prova. Mantieni e osserva.';
        } else if (enoughWeeks && plateau && !rpeCoverageSufficient) {
            reason = 'RPE realmente registrati su una frazione insufficiente del volume: non aumentare le serie senza dati migliori.';
        } else if (enoughWeeks && adherence !== null && adherence >= 0.8) {
            reason = 'Volume e aderenza recenti registrati: mantieni le serie finché non emergono segnali più chiari.';
        }

        byMuscle[muscle] = {
            action, volumeDelta, reason,
            weeklySetsObserved: metrics.avgWeeklySets,
            weeklyFractionalSetsObserved: fractional ?? null,
            fractionalRpeCoverage: metrics.fractionalRpeCoverage ?? null,
            recentAdherence: adherence,
            avgRpe: metrics.avgRpe
        };
        if (volumeDelta) summary.push({ target: muscle, action, reason });
    }

    // A possible stall is a prompt to select and review a strategy, not a
    // diagnosis. The already-calculated muscle-volume policy remains the only
    // source of any actual +1/-1 accessory prescription.
    for (const [key, decision] of Object.entries(byExercise)) {
        const evidence = report.byExercise[key];
        if (evidence?.status !== 'possible_stall') continue;
        const muscle = report.byMuscle?.[evidence.category] || {};
        const volume = byMuscle[evidence.category];
        let code = 'consolidate_and_review';
        let recommendation = 'Mantieni gli stimoli e ricontrolla le prestazioni comparabili, la tecnica e il recupero tra due settimane.';
        if (evidence.fatigueConcern) {
            code = 'review_recovery';
            recommendation = 'Prima di aumentare lo stimolo, riesamina fatica e recupero; applica solo gli alleggerimenti già autorizzati.';
        } else if (decision.action === 'increase_load' || decision.action === 'build_reps') {
            code = 'continue_double_progression';
            recommendation = 'Non aggiungere volume: prova la progressione minima già autorizzata, poi confronta due settimane di dati reali.';
        } else if (volume?.action === 'trial_accessory_volume') {
            code = 'trial_accessory_volume';
            recommendation = 'Una serie accessoria aggiuntiva può essere provata SOLO se il generatore la inserisce nel tempo disponibile; verifica la risposta dopo due settimane.';
        } else if (muscle.recentAdherence !== null &&
                   muscle.recentAdherence !== undefined && muscle.recentAdherence < 0.85) {
            code = 'improve_adherence';
            recommendation = 'Prima di modificare la scheda, completa le sedute programmate e rivaluta dopo due settimane.';
        } else if (evidence.avgRpe === null ||
                   (muscle.fractionalRpeCoverage !== undefined &&
                    muscle.fractionalRpeCoverage < 0.75)) {
            code = 'complete_evidence';
            recommendation = 'Registra RPE, ripetizioni e carico effettivi prima di scegliere una variazione del volume.';
        }
        decision.stallStrategy = {
            code, recommendation, reviewAfterWeeks: 2,
            evidenceMetric: evidence.trendMetric || 'e1rm',
            response: evidence.blockResponse || null,
            notice: 'Ipotesi di lavoro da verificare; non è una prova di efficacia o di crescita muscolare.'
        };
    }

    return { byExercise, byMuscle, summary };
}


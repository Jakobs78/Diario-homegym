/**
 * Decisioni conservative e spiegabili. Nessuna diagnosi di crescita muscolare:
 * kg, reps, volume e RPE descrivono prestazione, stimolo e tolleranza al lavoro.
 */
import { getAvailableLoadStep } from './loadProposal.js';
function incrementFor(weight, equipment) {
    if (equipment === 'dumbbell') return weight < 12.5 ? 0.5 : 1;
    if (equipment === 'cable' || equipment === 'lat_machine') return weight < 12.5 ? 0.5 : 1.25;
    return weight < 12.5 ? 1 : 2.5; // bilanciere
}
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
            const reduction = incrementFor(kg, exercise.equipment);
            plannedKg = roundLoad(Math.max(kg * 0.95, kg - reduction));
            reason = 'RPE ripetutamente superiore al target o ripetizioni sotto target con calo e1RM: alleggerimento prudente e verifica del recupero.';
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
        } else if (exercise.status === 'possible_stall') {
            action = 'review_stall';
            reason = 'Possibile stallo e1RM: conferma tecnica, sonno, pause e andamento dei carichi prima di ruotare esercizio o alzare il volume.';
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
        const plateau = relevant.some(ex => ex.status === 'possible_stall');
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

    return { byExercise, byMuscle, summary };
}

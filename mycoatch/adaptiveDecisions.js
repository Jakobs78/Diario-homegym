/**
 * Decisioni conservative e spiegabili. Nessuna diagnosi di crescita muscolare:
 * kg, reps, volume e RPE descrivono prestazione, stimolo e tolleranza al lavoro.
 */
function incrementFor(weight, equipment) {
    if (equipment === 'dumbbell') return weight < 12.5 ? 0.5 : 1;
    if (equipment === 'cable' || equipment === 'lat_machine') return weight < 12.5 ? 0.5 : 1.25;
    return weight < 12.5 ? 1 : 2.5; // bilanciere
}
const roundLoad = kg => Math.max(0, Math.round(kg * 4) / 4);

export function planAdaptiveDecisions(report) {
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
            const increment = incrementFor(kg, exercise.equipment);
            if (increment / kg <= 0.10) {
                action = 'increase_load';
                plannedKg = roundLoad(kg + increment);
                reason = 'Due settimane diverse, tutte le serie a ripetizioni alte con RPE misurato entro il target e carichi di lavoro confrontabili: piccolo incremento proposto (verifica i dischi/manubri disponibili).';
            } else {
                reason = 'Le due settimane giustificano una progressione, ma il passo minimo standard sarebbe superiore al 10% del carico: mantieni i kg oppure usa microcarichi realmente disponibili.';
            }
        } else if (exercise.status === 'possible_stall') {
            action = 'review_stall';
            reason = 'Possibile stallo e1RM: conferma tecnica, sonno, pause e andamento dei carichi prima di ruotare esercizio o alzare il volume.';
        } else if (exercise.status === 'regressing') {
            action = 'review_regression';
            reason = 'e1RM in calo, ma dati non sufficienti per attribuirlo alla fatica: mantieni e osserva la seduta seguente.';
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
            metrics.avgWeeklySets >= 3 && metrics.avgWeeklySets < 9) {
            volumeDelta = 1;
            action = 'trial_accessory_volume';
            reason = 'Possibile stallo con buona aderenza, RPE gestibile e volume recente moderato: prova una serie accessoria aggiuntiva, rispettando il tempo disponibile.';
        } else if (enoughWeeks && adherence !== null && adherence >= 0.8) {
            reason = 'Volume e aderenza recenti registrati: mantieni le serie finché non emergono segnali più chiari.';
        }

        byMuscle[muscle] = {
            action, volumeDelta, reason,
            weeklySetsObserved: metrics.avgWeeklySets,
            recentAdherence: adherence,
            avgRpe: metrics.avgRpe
        };
        if (volumeDelta) summary.push({ target: muscle, action, reason });
    }

    return { byExercise, byMuscle, summary };
}

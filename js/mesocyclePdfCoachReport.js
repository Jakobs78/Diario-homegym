/**
 * Read-only MyCoatch handoff inside the full mesocycle PDF.
 *
 * Metrics reuse the closure validator and the existing MyCoatch muscle catalog.
 * These are training-volume credits, NOT estimates of measured hypertrophy,
 * muscle activation, recovery or physiological adaptation.
 */
import { summarizeMesocycleClosure } from './mesocycleClosure.js';
import { isWarmupExercise, isWarmupSet, plannedWorkSetCount } from './workoutSemantics.js';
import { validateCompletedSet } from '../mycoatch/liveCoach.js';
import { contributionsForExercise, TRACKED_MUSCLES, VOLUME_ACCOUNTING_METHOD } from '../mycoatch/volumeAccounting.js';

const round = (n, decimals = 1) => Number(n.toFixed(decimals));
const isConfirmed = set => set?.isLocked === true || set?.completed === true;
const volume = () => Object.fromEntries(TRACKED_MUSCLES.map(m => [m, {
    direct: 0, indirect: 0, total: 0
}]));
const label = muscle => ({
    Back_Lats: 'Dorsali (ampiezza)', Back_Thickness: 'Dorso (spessore)'
}[muscle] || muscle);
const pretty = n => String(round(n, 2));

/** Same confirmed-set validation used by the existing closure review. */
function validatedWorkSets(exercise) {
    const logs = Array.isArray(exercise.loggedSets) ? exercise.loggedSets :
        Array.isArray(exercise.sets) ? exercise.sets : [];
    const expected = plannedWorkSetCount(exercise);
    return logs.filter(set => {
        if (!isConfirmed(set) || isWarmupSet(set)) return false;
        return validateCompletedSet(set, exercise, set).ok;
    }).slice(0, expected).map(set => validateCompletedSet(set, exercise, set));
}

function addCredits(target, contribution) {
    for (const [key, sets] of Object.entries(contribution.direct)) {
        target[key].direct += sets;
        target[key].total += sets;
    }
    for (const [key, credit] of Object.entries(contribution.indirect)) {
        target[key].indirect += credit;
        target[key].total += credit;
    }
}

function inspectWeek(week, index) {
    const planned = volume(), confirmed = volume(), unclassified = new Set();
    let recognizedPlannedSets = 0, recognizedCompletedSets = 0, tonnage = 0;
    for (const day of week.days || []) {
        for (const exercise of day.exercises || []) {
            if (isWarmupExercise(exercise)) continue;
            const expected = plannedWorkSetCount(exercise);
            const valid = validatedWorkSets(exercise);
            // Observed tonnage counts the initial/main part of special techniques.
            // Bodyweight and additional drops are not converted to fictitious kg.
            tonnage += valid.reduce((total, set) =>
                total + set.weight * set.numericReps, 0);
            const plannedContribution = contributionsForExercise(exercise.name, expected);
            const confirmedContribution = contributionsForExercise(exercise.name, valid.length);
            if (expected && !plannedContribution) unclassified.add(exercise.name || 'Esercizio non specificato');
            if (plannedContribution) {
                recognizedPlannedSets += expected;
                addCredits(planned, plannedContribution);
            }
            if (confirmedContribution) {
                recognizedCompletedSets += valid.length;
                addCredits(confirmed, confirmedContribution);
            }
        }
    }
    return {
        weekNumber: week.weekNumber ?? index + 1,
        isDeloadWeek: Boolean(week.isDeloadWeek),
        planned, confirmed,
        recognizedPlannedSets, recognizedCompletedSets,
        tonnage: round(tonnage, 1),
        unclassified: [...unclassified]
    };
}

export function buildMesocycleCoachPdfReport(mesocycle) {
    const closure = summarizeMesocycleClosure(mesocycle);
    const weeks = (mesocycle?.weeks || []).map(inspectWeek);
    const planned = volume(), confirmed = volume();
    const unclassified = new Set();
    let plannedRecognized = 0, confirmedRecognized = 0, tonnage = 0;
    for (const week of weeks) {
        plannedRecognized += week.recognizedPlannedSets;
        confirmedRecognized += week.recognizedCompletedSets;
        tonnage += week.tonnage;
        for (const name of week.unclassified) unclassified.add(name);
        for (const muscle of TRACKED_MUSCLES) {
            for (const key of ['direct', 'indirect', 'total']) {
                planned[muscle][key] += week.planned[muscle][key];
                confirmed[muscle][key] += week.confirmed[muscle][key];
            }
        }
    }
    const totalCredits = TRACKED_MUSCLES.reduce((sum, name) =>
        sum + confirmed[name].total, 0);
    const muscleRows = TRACKED_MUSCLES.map(muscle => ({
        kind: 'coach-muscle', muscle, title: label(muscle),
        direct: round(confirmed[muscle].direct, 2),
        indirect: round(confirmed[muscle].indirect, 2),
        credited: round(confirmed[muscle].total, 2),
        share: totalCredits > 0 ? round(confirmed[muscle].total / totalCredits * 100) : null,
        planned: round(planned[muscle].total, 2),
        execution: planned[muscle].total > 0
            ? round(100 * confirmed[muscle].total / planned[muscle].total) : null
    }));
    const noValue = value => value === null ? 'n.d.' : String(value);
    const text = txt => ({kind:'coach-text', text:txt});
    const section = title => ({kind:'coach-section', title});
    const rows = [
        section('MYCOATCH · BILANCIO DI FINE MESOCICLO'),
        text('Periodo: ' + closure.weeks + ' settimane programmate · ' +
            (mesocycle?.coachClosure?.status === 'closed' ? 'mesociclo concluso' :
                'fotografia dei dati registrati finora (anche se incompleti)')),
        text('SEDUTE: ' + closure.completedSessions + '/' + closure.plannedSessions +
            ' complete (' + (closure.adherencePercent ?? 'n.d.') + '%), ' +
            closure.partialSessions + ' parziali, ' + closure.skippedSessions + ' non iniziate.'),
        text('SERIE ALLENANTI: ' + closure.completedSets + '/' + closure.plannedSets +
            ' confermate e valide (' + (closure.setCompletionPercent ?? 'n.d.') + '%). ' +
            'Serie spuntate con dati non validi: ' + closure.invalidConfirmedSets + '.'),
        text('RPE (sforzo percepito) registrati: ' + closure.measuredRpeSets + '/' + closure.completedSets +
            ' serie completate; media dello sforzo registrato ' + noValue(closure.averageRpe) + '.'),
        text('Sedute ripetute conservate nello storico: ' + closure.archivedRepeats +
            ' (descritte nel diario, non sommate alle sedute del programma).'),
        section('ANDAMENTO PER SETTIMANA'),
    ];
    for (const [index, week] of weeks.entries()) {
        const original = closure.weeklyResults.find(w =>
            String(w.weekNumber) === String(week.weekNumber)) || closure.weeklyResults[index];
        rows.push(text('Sett. ' + week.weekNumber +
            (week.isDeloadWeek ? ' [SCARICO]' : '') + ': ' +
            (original?.completedSets ?? 0) + '/' + (original?.plannedSets ?? 0) +
            ' serie valide · RPE ' + (original?.rpeMeasured ?? 0) + '/' +
            (original?.completedSets ?? 0) + ' (media ' +
            noValue(original?.averageRpe ?? null) + ')' +
            ' · peso × ripetizioni registrate: ' + pretty(week.tonnage) + ' kg x rip.'));
    }
    rows.push(
        section('LAVORO ATTRIBUITO AI GRUPPI MUSCOLARI (STIMA)'),
        text('Come leggere questa tabella: per convenzione una serie vale 1 credito per il muscolo principale e 0,5 per un ' +
            'muscolo che collabora in modo significativo. I crediti sono un modo per distribuire le serie già fatte, NON altre serie da eseguire. La quota % indica la parte ' +
            'del volume attribuito ai distretti riconosciuti, NON la percentuale ' +
            'di crescita, attivazione o fatica muscolare.'),
        text('Serie fisiche valide riconosciute: ' + confirmedRecognized +
            '/' + plannedRecognized + ' programmate. ' +
            'Tonnellaggio totale descrittivo: ' + pretty(tonnage) +
            ' kg x rip. (non include scarichi aggiuntivi e peso corporeo).'),
        {kind:'coach-muscle-head'},
        ...muscleRows,
        text('Le percentuali comprendono solo esercizi riconosciuti nel catalogo di MyCoatch. ' +
            'Un esercizio che coinvolge più muscoli può contribuire a diversi conteggi, perciò ' +
            'non devi sommare i crediti come se fossero serie separate realmente eseguite.'),
        section('EVIDENZE PER PROGRAMMARE IL PROSSIMO MESOCICLO')
    );
    if (closure.exerciseChanges.length) {
        rows.push(text('RISULTATI CONFRONTABILI TRA SETTIMANE COMPLETE (carichi e ripetizioni):'));
        for (const ex of closure.exerciseChanges) {
            rows.push(text(ex.name + ': sett. ' + ex.firstWeek + ' ' +
                ex.firstKg + ' kg x ' + ex.firstMinReps + ' rip. min. / sett. ' +
                ex.lastWeek + ' ' + ex.lastKg + ' kg x ' + ex.lastMinReps + ' rip. min.' +
                (ex.deltaReps === null ? ' · carichi diversi: confronto ripetizioni non valido.' :
                    ' · differenza di ripetizioni con lo stesso peso: ' + (ex.deltaReps > 0 ? '+' : '') +
                    ex.deltaReps + '.')));
        }
    } else rows.push(text('Confronti di forza/progressione: dati insufficienti ' +
        'tra sedute complete con carichi confrontabili.'));
    if (closure.incompleteDays.length) {
        rows.push(text('SEDUTE DA COMPLETARE O VERIFICARE (le serie non confermate non contano):'));
        for (const day of closure.incompleteDays) rows.push(text(
            'Sett. ' + day.weekNumber + ', ' + day.dayName + ': ' +
            day.confirmedSets + '/' + day.plannedSets + ' serie confermate.'));
    }
    if (closure.measuredRpeSets < closure.completedSets) rows.push(text(
        'RPE mancanti su ' + (closure.completedSets - closure.measuredRpeSets) +
        ' serie valide: impossibile confrontare in modo completo lo sforzo tra settimane.'));
    if (unclassified.size) rows.push(text(
        'ESERCIZI NON CLASSIFICATI (esclusi dalle percentuali muscolari): ' +
        [...unclassified].sort((a,b)=>a.localeCompare(b,'it')).join('; ') + '.'));
    const underserved = muscleRows.filter(row => row.planned > 0 && row.execution < 100);
    if (underserved.length) rows.push(text(
        'Distretto/i con meno crediti registrati rispetto al piano: ' +
        underserved.map(row => row.title + ' (' + row.execution + '%)').join(', ') +
        '. Verificare sedute incomplete ed esclusioni prima di variare il volume.'));
    rows.push(text('COME USARE IL REPORT: questi indicatori mostrano cosa hai effettivamente registrato, non ciò che avresti dovuto fare. '
        'Non misurano ipertrofia, recupero o la causa di eventuali cali. ' +
        'Prima di scegliere i carichi e gli esercizi delle prossime settimane, serve una ' +
        'valutazione del coach, dei sintomi e del recupero non registrati qui.'),
        section('DIARIO COMPLETO · PROGRAMMA E PRESTAZIONI'));
    return {
        rows, closure, muscles: muscleRows, weekly: weeks,
        volumeMethod: VOLUME_ACCOUNTING_METHOD,
        unclassified: [...unclassified],
        physicalSets: {plannedRecognized, confirmedRecognized},
        tonnage: round(tonnage,1)
    };
}

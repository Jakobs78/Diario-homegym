import {excludedFromCoaching} from './setReview.js';
import {isBodyweightExercise} from './bodyweight.js';
import { HIGH_REP_EXERCISES } from './prescriptionPolicy.js';
import { isWarmupExercise, isWarmupSet } from '../js/workoutSemantics.js';
// Analisi conservativa dei dati realmente registrati.
// Non sostituisce gli RPE mancanti con valori inventati e non considera una serie
// prescritta come completata.
export function exerciseKey(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function numericValue(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(',', '.').replace('@', '').trim());
    return Number.isFinite(n) ? n : null;
}

function actualSets(exercise) {
    const source = Array.isArray(exercise?.loggedSets) ? exercise.loggedSets :
        (Array.isArray(exercise?.sets) ? exercise.sets : []);
    return source.flatMap(set => {
        if ((set?.isLocked !== true && set?.completed !== true) || isWarmupSet(set)||excludedFromCoaching(set)) return [];
        const weight = numericValue(set.weight ?? set.actualKg);
        const reps = numericValue(set.reps ?? set.actualReps);
        const bodyweight = isBodyweightExercise(exercise);
        if (weight === null || weight < 0 || (weight === 0 && !bodyweight) || reps === null || reps <= 0) return [];
        const rpe = numericValue(set.rpe);
        return [{ weight, reps, rpe: !set.dropSegments?.length && !set.intensityTechnique && rpe !== null && rpe >= 6 && rpe <= 10 ? rpe : null }];
    });
}

export function estimateE1rm(weight, reps, rpe) {
    if (![weight, reps, rpe].every(Number.isFinite) || weight <= 0 || reps <= 0 ||
        rpe < 6 || rpe > 10 || reps > 12) return null;
    return weight * (1 + (reps + Math.max(0, 10 - rpe)) / 30);
}

export function analyzeCompletedMesocycle(mesocycle) {
    const result = {
        stalledExercises: [],
        exerciseNotes: {},
        byExercise: {},
        recommendation: 'insufficient_data'
    };
    if (mesocycle?.excludedFromCoaching || !Array.isArray(mesocycle?.weeks)) return result;

    const weeks = [...mesocycle.weeks].sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber));
    for (const week of weeks) {
        for (const day of (week.days || [])) {
            for (const exercise of (day.exercises || [])) {
                if(isWarmupExercise(exercise)) continue;
                const key = exerciseKey(exercise.name);
                if (!key) continue;
                const sets = actualSets(exercise);
                if (!sets.length) continue;
                const record = result.byExercise[key] ||= {
                    name: exercise.name, lastKg: null, exposures: [],
                    validSets: 0, status: 'insufficient_data'
                };
                record.validSets += sets.length;
                record.lastKg = Math.max(...sets.map(set => set.weight));
                const estimates = sets.map(s => isBodyweightExercise(exercise) || Object.keys(HIGH_REP_EXERCISES).some(name => exerciseKey(name) === exerciseKey(exercise.name)) ? null : estimateE1rm(s.weight, s.reps, s.rpe))
                    .filter(v => v !== null);
                if (estimates.length) {
                    const weekNum = Number(week.weekNumber);
                    const existing = record.exposures.find(p => p.week === weekNum);
                    if (existing) existing.e1rm = Math.max(existing.e1rm, ...estimates);
                    else record.exposures.push({ week: weekNum, e1rm: Math.max(...estimates) });
                }
            }
        }
    }

    for (const [key, record] of Object.entries(result.byExercise)) {
        const points = record.exposures;
        const weeksCount = new Set(points.map(p => p.week)).size;
        if (points.length < 3 || weeksCount < 3) {
            result.exerciseNotes[key] = 'Dati insufficienti per valutare lo stallo: servono almeno 3 esposizioni in settimane diverse con RPE registrato.';
            continue;
        }
        const latest = points.slice(-3);
        const first = latest[0].e1rm;
        const second = latest[1].e1rm;
        const last = latest[2].e1rm;
        const changePercent = ((last / first) - 1) * 100;
        record.changePercent = Math.round(changePercent * 10) / 10;
        if (last <= first * 1.01 && last <= second * 1.015) {
            record.status = 'possible_stall';
            result.stalledExercises.push(record.name);
            result.exerciseNotes[key] = 'Possibile stallo e1RM su 3 esposizioni: verificare RPE, tecnica, aderenza e recupero prima di modificare il programma.';
        } else if (last > first * 1.02) {
            record.status = 'progressing';
            result.exerciseNotes[key] = 'Prestazione in progressione nelle ultime 3 esposizioni.';
        } else {
            record.status = 'stable';
            result.exerciseNotes[key] = 'Prestazione sostanzialmente stabile: proseguire il monitoraggio.';
        }
    }
    result.recommendation = result.stalledExercises.length ? 'review_recommended' :
        (Object.values(result.byExercise).some(r => r.status !== 'insufficient_data')
            ? 'maintain_or_progress' : 'insufficient_data');
    return result;
}


// Decisioni prudenziali di programmazione: RPE prescritto non misurato.
// Fatica in una sola regione non prova necessità di scarico globale.
import { assessRecoveryScope, recoveryRegion } from './recoveryScope.js';

export function deriveMesocyclePolicy(config = {}, history = {}, onboarding = {}) {
  const count = Number(config.durationWeeks ?? 4);
  if (!Number.isInteger(count) || count < 1 || count > 12) throw Error('Durata non valida');
  const assessment=assessRecoveryScope(history);
  const signals=assessment.recoverySignals;
  const recoveryFirst=assessment.recoveryRequired;
  // The new Full Body protocol uses recovery evidence rather than an
  // automatic week-four deload. Preserve the prior conservative template
  // for legacy Upper/Lower and three-day programmes.
  const evidenceBasedDeload = config.splitPreference === 'fullbody';
  const measured = Object.values(history?.byExercise || {}).filter(ex =>
    ex?.progressionEvidence?.recentWeeksQualified === true &&
    Number(ex?.progressionEvidence?.distinctWeeks || 0) >= 2 &&
    !ex?.fatigueConcern && recoveryRegion(ex?.category));
  const regions = new Set(measured.map(ex=>recoveryRegion(ex.category)));
  const progressing = measured.filter(ex=>
    ex?.progressionEvidence?.readyForLoad === true ||
    ex?.progressionEvidence?.readyForReps === true ||
    ex?.readyForLoad === true || ex?.readyForReps === true);
  const enoughEvidence = measured.length >= 3 && regions.size >= 2 &&
    progressing.length >= 1 && assessment.scope === 'none';
  const athleteChoice = Object.hasOwn(config,'deloadWeek') &&
    config.deloadWeek !== undefined && config.deloadWeek !== null;
  const deloadRationale = recoveryFirst
    ? 'Recupero globale prioritario: scarico iniziale per segnali ripetuti su più regioni.'
    : config.deloadWeek === false ? 'Nessuno scarico a calendario su richiesta esplicita; rivaluta recupero e risultati.'
      : athleteChoice ? 'Settimana di scarico scelta esplicitamente dall’atleta.'
      : enoughEvidence ? 'Nessuno scarico automatico: progressi confrontabili su più regioni; rivaluta il recupero ogni settimana.'
      : evidenceBasedDeload
        ? 'Full Body: niente scarico automatico senza segnali ripetuti di fatica; dati limitati, serve verifica settimanale.'
        : 'Scarico prudenziale finale del template originale: dati di recupero insufficienti per una gestione adattiva.';
  // La preferenza dell'atleta puo' spostare o rimuovere lo scarico
  // soltanto in assenza di fatica ripetuta e attendibile. Se il recupero
  // e' prioritario, nessuna opzione puo' posticiparlo.
  let deloadWeek = recoveryFirst ? 1 :
    config.deloadWeek === false ? null :
    Number.isInteger(config.deloadWeek) ? config.deloadWeek :
    config.deloadWeek === true ? count :
    count >= 4 && !enoughEvidence && !evidenceBasedDeload ? count : null;
  if (deloadWeek !== null && (deloadWeek < 1 || deloadWeek > count))
    throw Error('Settimana di scarico non valida');
  const weeks = Array.from({length: count}, (_, i) => {
    const weekNumber = i + 1;
    const isDeload = weekNumber === deloadWeek;
    const typical = config.focus === 'strength' ? [7.5, 8, 8.5] : [7.5, 8, 8];
    const guided = onboarding.calibrationWeek ? onboarding.rpeTargets?.[i] : null;
    const raw = guided === undefined || guided === null ? typical[Math.min(i, 2)] : Number(guided);
    // Some guided onboards preallocate a very light final week assuming
    // the legacy deload. In the opt-in adaptive Full Body programme this is
    // a consolidation week instead: do not silently assign a recovery RPE.
    const priorGuided=Number(onboarding.rpeTargets?.[i-1]);
    const effort=evidenceBasedDeload && !isDeload && onboarding.calibrationWeek &&
        i===count-1 && Number.isFinite(priorGuided) ?
        Math.max(raw,priorGuided) : raw;
    const ceiling = onboarding.experience === 'beginner' ? 8 : 8.5;
    const targetRpe = isDeload ? 6.5 : Math.min(ceiling, Math.max(6, Number.isFinite(effort) ? effort : 7.5));
    const phase = isDeload ? 'recovery' :
      onboarding.calibrationWeek && i === 0 ? 'calibration' :
      i === count - 1 ? 'consolidation' : 'accumulation';
    return {weekNumber, isDeload, phase, targetRpe,
      progressionRule: 'progress_only_after_confirmed_reps_and_rpe'};
  });
  return {version: 1, blockNumber: Math.max(1, (history.inspectedMesocycles || 0) + 1),
    recoveryFirst, recoveryScope:assessment.scope,
    fatiguedMuscles:assessment.fatiguedMuscles,
    recoverySignals: signals, deloadWeek, deloadRationale,
    evidence: {comparableExercises:measured.length,bodyRegions:regions.size,progressingExercises:progressing.length},weeks};
}

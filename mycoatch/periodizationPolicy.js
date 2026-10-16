// Decisioni prudenziali di programmazione: RPE prescritto non misurato.
// Una settimana difficile non prova fatica sistemica.
export function deriveMesocyclePolicy(config = {}, history = {}, onboarding = {}) {
  const count = Number(config.durationWeeks ?? 4);
  if (!Number.isInteger(count) || count < 1 || count > 12) throw Error('Durata non valida');
  const signals = Object.values(history.byExercise || {}).filter(ex =>
    ex.fatigueConcern && ex.progressionEvidence?.distinctWeeks >= 2
  ).map(ex => ex.name);
  const recoveryFirst = signals.length > 0;
  // La preferenza dell'atleta puo' spostare o rimuovere lo scarico
  // soltanto in assenza di fatica ripetuta e attendibile. Se il recupero
  // e' prioritario, nessuna opzione puo' posticiparlo.
  let deloadWeek = recoveryFirst ? 1 :
    config.deloadWeek === false ? null :
    Number.isInteger(config.deloadWeek) ? config.deloadWeek :
    config.deloadWeek === true ? count :
    count >= 4 ? count : null;
  if (deloadWeek !== null && (deloadWeek < 1 || deloadWeek > count))
    throw Error('Settimana di scarico non valida');
  const weeks = Array.from({length: count}, (_, i) => {
    const weekNumber = i + 1;
    const isDeload = weekNumber === deloadWeek;
    const typical = config.focus === 'strength' ? [7.5, 8, 8.5] : [7.5, 8, 8];
    const guided = onboarding.calibrationWeek ? onboarding.rpeTargets?.[i] : null;
    const raw = guided === undefined || guided === null ? typical[Math.min(i, 2)] : Number(guided);
    const ceiling = onboarding.experience === 'beginner' ? 8 : 8.5;
    const targetRpe = isDeload ? 6.5 : Math.min(ceiling, Math.max(6, Number.isFinite(raw) ? raw : 7.5));
    const phase = isDeload ? 'recovery' :
      onboarding.calibrationWeek && i === 0 ? 'calibration' :
      i === count - 1 ? 'consolidation' : 'accumulation';
    return {weekNumber, isDeload, phase, targetRpe,
      progressionRule: 'progress_only_after_confirmed_reps_and_rpe'};
  });
  return {version: 1, blockNumber: Math.max(1, (history.inspectedMesocycles || 0) + 1),
    recoveryFirst, recoverySignals: signals, deloadWeek, weeks};
}

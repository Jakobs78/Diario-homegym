/**
 * Politica unica del recupero per serie normali, superserie, triset e dropset.
 * I gruppi avviano il timer soltanto dopo l'ultimo esercizio della sequenza.
 * Non dedurre pause intermedie dalla presenza incidentale della parola "pausa"
 * nelle note: la struttura del gruppo è la fonte autorevole.
 */
export function shouldStartRecoveryTimer(exercise, set, setIndex, totalSets) {
    if (!exercise || !set) return false;
    if (exercise.groupType && !exercise.isGroupLast) return false;

    const dropset = exercise.isDropset || exercise.groupType === 'dropset';
    if (dropset && setIndex !== totalSets - 1) return false;

    if (set.intensityTechnique) return false;
    return true;
}

/**
 * A concise, athlete-facing exercise instruction for the 12-column CSV.
 * MyCoatch diagnostic reasons remain in the in-memory coach report.
 * Preserve legacy [SPLIT], [SUPERSERIE], [TRISET] and [DROP] tokens:
 * the workout CSV importer uses them to reconstruct the original plan.
 */
function cue(exercise) {
    const name = exercise.name || '';
    if (name === 'Hamstring Walkout a Corpo Libero')
        return 'Dal ponte glutei cammina sui talloni avanti e indietro, bacino stabile; registra 0 kg.';
    if (name.includes('Croci')) return 'Gomiti leggermente flessi, movimento controllato e senza slanci.';
    if (name.includes('Lat Machine') || name.includes('Trazioni'))
        return 'Tira verso il torace senza oscillare, controlla la risalita.';
    if (name.includes('Rematore') || name.includes('Pulley'))
        return 'Schiena stabile, tira i gomiti indietro e controlla il ritorno.';
    if (name.includes('Alzate')) return 'Solleva senza slanci, controlla la discesa.';
    if (name.includes('Curl')) return 'Gomiti stabili, evita di oscillare.';
    if (name.includes('Pushdown')) return 'Gomiti fermi lungo il busto, estendi senza slanci.';
    if (name.includes('Crunch')) return 'Fletti il tronco, non tirare con le braccia.';
    if (name.includes('Squat') || name.includes('Affondi') || name.includes('Leg Press'))
        return 'Tronco stabile, discesa controllata e ampiezza ripetibile.';
    if (name.includes('Stacco')) return 'Spingi il bacino indietro, schiena stabile e bilanciere vicino.';
    if (name.includes('Hip Thrust') || name.includes('Glute Bridge'))
        return 'Spingi con i talloni, blocca il bacino senza iperestendere la schiena.';
    if (name.includes('Panca')) return 'Scapole stabili, discesa e spinta controllate.';
    if (name.includes('Military') || name.includes('Spinte'))
        return 'Addome attivo, spinta controllata e niente slanci.';
    if (name.includes('Calf Raise')) return 'Massima escursione controllata, senza rimbalzi.';
    if (name.includes('Pallof')) return 'Resisti alla rotazione, busto stabile.';
    if (name.includes('Leg Curl')) return 'Fletti il ginocchio senza muovere il bacino.';
    if (name.includes('Face Pull') || name.includes('Reverse Fly'))
        return 'Gomiti controllati, evita di compensare con la schiena.';
    if (name.includes('Pulldown')) return 'Porta le braccia verso i fianchi senza oscillare.';
    if (name.includes('Pull-through')) return 'Spingi i glutei indietro e torna in piedi senza slanci.';
    return exercise.pattern === 'hinge'
        ? 'Bacino indietro, schiena stabile, esecuzione controllata.'
        : 'Movimento controllato, senza slanci.';
}

export function conciseExerciseInstruction(exercise) {
    const verbose = String(exercise?.notes || '');
    const parts = [];
    const split = /^\[SPLIT MYCOATCH\]\s*(Upper [AB]|Lower [AB]|Full Body [ABC])/i.exec(verbose);
    if (split) parts.push('[SPLIT MYCOATCH] ' + split[1]);
    if (verbose.includes('[SUPERSERIE]')) parts.push('[SUPERSERIE] Con il prossimo esercizio; recupera dopo la coppia.');
    if (verbose.includes('[TRISET]')) parts.push('[TRISET] Tre esercizi consecutivi; recupera dopo il gruppo.');
    if (verbose.includes('[WARM-UP AUTO]')) {
        const warmup = /\[WARM-UP AUTO\]:?\s*([^|.]+)/.exec(verbose);
        parts.push('[WARM-UP AUTO] ' + (warmup?.[1]?.trim() || 'Avvicinamento progressivo.'));
    } else if (verbose.includes('[WARM-UP]')) parts.push('[WARM-UP] Serie leggere di avvicinamento.');
    if (verbose.includes('[RIFERIMENTO ATLETA]')) {
        const reference = /\[RIFERIMENTO ATLETA\]\s*(\d+(?:[.,]\d+)?)\s*kg/.exec(verbose);
        if (reference) parts.push('[RIFERIMENTO ATLETA] ' + reference[1] + ' kg dichiarati, da verificare.');
    }
    if (verbose.includes('[VOLUME INIZIALE]'))
        parts.push('[VOLUME INIZIALE] Solo le serie previste nella scheda.');
    if (verbose.includes('[CALIBRAZIONE MYCOATCH]'))
        parts.push('[CALIBRAZIONE MYCOATCH] Prima settimana: carico leggero, tecnica prima del peso.');
    if (verbose.includes('Scarico:') || verbose.includes('🛡️ Scarico'))
        parts.push('SCARICO: carichi/serie ridotti come da scheda.');
    const drop = exercise?.sets?.at(-1)?.intensityTechnique;
    if (drop === 'DROP_SET') parts.push('[DROP_SET] [DROP_SCOPE:LAST] Scarica il peso solo dopo l’ultima serie.');
    else if (drop === 'REST_PAUSE') parts.push('[REST_PAUSE] Ultima serie: pausa breve e riparti.');
    if (verbose.includes('[ATTREZZATURA DA CONFIGURARE]'))
        parts.push('Carico: configura il bilanciere prima di allenarti.');
    else if (verbose.includes('non è componibile'))
        parts.push('Carico: verifica i dischi disponibili.');
    else if ((exercise.kgMin === '' || exercise.kgMin == null) &&
        exercise.equipment !== 'bodyweight')
        parts.push('Carico: calibra kg in base a reps e RPE.');
    parts.push(cue(exercise));
    // The legacy 12-column CSV must not gain a pseudo-separator in Note.
    return parts.join(' | ').replace(/;/g, ',');
}

/**
 * A concise, athlete-facing exercise instruction for the 12-column CSV.
 * MyCoatch diagnostic reasons remain in the in-memory coach report.
 * Preserve legacy [SPLIT], [SUPERSERIE], [TRISET] and [DROP] tokens:
 * the workout CSV importer uses them to reconstruct the original plan.
 */
function cue(exercise) {
    const name = exercise.name || '';
    if (name === 'Hamstring Walkout a Corpo Libero')
        return 'Parti dal ponte con il bacino sollevato: allontana lentamente i talloni e riportali verso i glutei senza lasciare cadere il bacino. A corpo libero registra 0 kg.';
    if (name.includes('Croci')) return 'Mantieni i gomiti leggermente flessi e quasi fermi; apri fino all’ampiezza che controlli e richiudi senza sbattere i pesi o usare slancio.';
    if (name.includes('Lat Machine') || name.includes('Trazioni'))
        return 'Tieni il busto stabile e tira la barra o l’impugnatura verso la parte alta del torace guidando i gomiti verso il basso. Risali lentamente senza slanciarti.';
    if (name.includes('Rematore') || name.includes('Pulley'))
        return 'Mantieni la schiena stabile; porta i gomiti indietro senza strappare con il busto e accompagna lentamente il peso al ritorno.';
    if (name.includes('Alzate Posteriori') || name.includes('Reverse Fly'))
        return 'Inclina il busto mantenendo la schiena stabile. Apri le braccia verso i lati con i gomiti leggermente flessi, senza sollevare le spalle, poi torna lentamente.';
    if (name.includes('Alzate Laterali'))
        return 'Solleva i manubri lateralmente fino a un’altezza che controlli, con gomiti lievemente flessi. Evita di dondolare il busto e scendi lentamente.';
    if (name.includes('Alzate')) return 'Solleva senza slanci, poi abbassa il peso lentamente mantenendo il controllo.';
    if (name.includes('Leg Curl')) return 'Non muovere il bacino: piega il ginocchio avvicinando il tallone al gluteo, poi distendi lentamente senza lasciar cadere il peso.';
    if (name.includes('Curl')) return 'Tieni i gomiti vicini al busto e piega le braccia senza dondolare con la schiena. Scendi in modo controllato.';
    if (name.includes('Pushdown')) return 'Mantieni i gomiti vicini ai fianchi: distendi le braccia verso il basso senza muovere le spalle, poi ritorna lentamente.';
    if (name.includes('Crunch')) return 'Avvicina il torace al bacino flettendo l’addome, senza tirare il collo con le mani. Torna lentamente alla partenza.';
    if (name.includes('Squat') || name.includes('Affondi') || name.includes('Leg Press'))
        return 'Mantieni il busto stabile, scendi con controllo fino a un’ampiezza che riesci a ripetere e risali spingendo con tutta la pianta del piede.';
    if (name.includes('Stacco')) return 'Spingi il bacino indietro mantenendo la schiena stabile e il peso vicino alle gambe. Scendi finché controlli la posizione, poi risali estendendo le anche.';
    if (name.includes('Hip Thrust') || name.includes('Glute Bridge'))
        return 'Spingi attraverso i piedi e solleva il bacino contraendo i glutei; fermati con il tronco allineato alle cosce, senza inarcare la zona lombare.';
    if (name.includes('Panca')) return 'Appoggia bene i piedi e mantieni le scapole stabili sulla panca. Abbassa il peso in controllo e spingi senza perdere l’assetto.';
    if (name.includes('Military') || name.includes('Spinte'))
        return 'Contrai addome e glutei per stabilizzare il busto: spingi sopra la testa senza piegarti all’indietro, poi scendi lentamente.';
    if (name.includes('Calf Raise')) return 'Solleva i talloni fino alla massima altezza controllabile, fermati brevemente e scendi lentamente senza rimbalzare.';
    if (name.includes('Pallof')) return 'Tieni il busto fermo mentre allontani l’impugnatura dal petto: il cavo tira lateralmente, ma spalle e bacino restano rivolti avanti.';
    if (name.includes('Face Pull') || name.includes('Reverse Fly'))
        return 'Tira verso il viso aprendo i gomiti in modo controllato, senza inarcare la schiena o strattonare il cavo.';
    if (name.includes('Pulldown')) return 'Porta le braccia verso i fianchi senza oscillare.';
    if (name.includes('Pull-through')) return 'Spingi i glutei indietro e torna in piedi senza slanci.';
    return exercise.pattern === 'hinge'
        ? 'Bacino indietro, schiena stabile, esecuzione controllata.'
        : 'Movimento controllato, senza slanci.';
}

export function conciseExerciseInstruction(exercise) {
    const verbose = String(exercise?.notes || '');
    const parts = [];
    const split = /^\[SPLIT MYCOATCH\]\s*(Upper [AB]|Lower [AB]|Full Body [ABCD])/i.exec(verbose);
    if (split) parts.push('[SPLIT MYCOATCH] ' + split[1]);
    if (verbose.includes('[SUPERSERIE]')) parts.push('[SUPERSERIE] Esegui questo esercizio e quello successivo uno dopo l'altro; riposa dopo averli completati entrambi.');
    if (verbose.includes('[TRISET]')) parts.push('[TRISET] Esegui tre esercizi consecutivi; fai la pausa prevista solo dopo il terzo.');
    if (verbose.includes('[WARM-UP AUTO]')) {
        const warmup = /\[WARM-UP AUTO\]:?\s*([^|.]+)/.exec(verbose);
        parts.push('[WARM-UP AUTO] ' + (warmup?.[1]?.trim() || 'Esegui serie preparatorie leggere prima delle serie allenanti, aumentando gradualmente il peso senza arrivare a fatica.'));
    } else if (verbose.includes('[WARM-UP]')) parts.push('[WARM-UP] Prima delle serie allenanti esegui alcune serie leggere, aumentando gradualmente il carico senza affaticarti.');
    if (verbose.includes('[RIFERIMENTO ATLETA]')) {
        const reference = /\[RIFERIMENTO ATLETA\]\s*(\d+(?:[.,]\d+)?)\s*kg/.exec(verbose);
        if (reference) parts.push('[RIFERIMENTO ATLETA] ' + reference[1] + ' kg indicati da te, non verificati nello storico. Controlla nella prima seduta se permettono le ripetizioni con l’RPE richiesto.' +
            (verbose.includes('Peso non prescritto automaticamente') ? ' Non adottati come carico automatico.' : ''));
    }
    if (verbose.includes('[VOLUME INIZIALE]'))
        parts.push('[VOLUME INIZIALE] Per la fase iniziale esegui soltanto le serie indicate: non aggiungere serie extra finché non abbiamo dati sul recupero.');
    if (verbose.includes('[CALIBRAZIONE MYCOATCH]'))
        parts.push('[CALIBRAZIONE MYCOATCH] Nella prima settimana scegli un peso gestibile, completa le ripetizioni con tecnica controllata e registra peso e RPE effettivi.');
    if (verbose.includes('Scarico:') || verbose.includes('🛡️ Scarico'))
        parts.push('SCARICO: settimana meno impegnativa. Segui le serie e l’RPE più bassi indicati, senza cercare nuovi record.');
    const drop = exercise?.sets?.at(-1)?.intensityTechnique;
    if (drop === 'DROP_SET') parts.push('[DROP_SET] [DROP_SCOPE:LAST] dropset: riduci il peso solo dopo l’ultima serie.');
    else if (drop === 'REST_PAUSE') parts.push('[REST_PAUSE] Ultima serie: pausa breve e riparti.');
    if (verbose.includes('[ATTREZZATURA DA CONFIGURARE]'))
        parts.push('Carico non ancora assegnato: configura peso e diametro del bilanciere e verifica quali dischi possiedi prima di scegliere i kg.');
    else if (verbose.includes('non è componibile'))
        parts.push('Il peso proposto non si può montare con i dischi registrati: scegli il carico disponibile più adatto al target, senza forzare un incremento.');
    else if ((exercise.kgMin === '' || exercise.kgMin == null) &&
        exercise.equipment !== 'bodyweight')
        parts.push('Peso da definire: inizia con serie leggere di prova, poi scegli un carico che permetta le ripetizioni richieste all’RPE previsto e registralo nel diario.');
    parts.push(cue(exercise));
    // The legacy 12-column CSV must not gain a pseudo-separator in Note.
    return parts.join(' | ').replace(/;/g, ',');
}

/**
 * A concise, athlete-facing exercise instruction for the 12-column CSV.
 * MyCoatch diagnostic reasons remain in the in-memory coach report.
 * Preserve legacy [SPLIT], [SUPERSERIE], [TRISET] and [DROP] tokens:
 * the workout CSV importer uses them to reconstruct the original plan.
 */
function cue(exercise) {
    const name = exercise.name || '';
    if (name === 'Hamstring Walkout a Corpo Libero')
        return 'Parti dal ponte glutei con il bacino sollevato. Fai piccoli passi in avanti sui talloni e poi torna indietro senza abbassare il bacino. Andata e ritorno valgono una ripetizione. Se non aggiungi pesi, registra 0 kg.';
    if (name.includes('Croci')) return 'Mantieni i gomiti leggermente piegati, apri le braccia senza forzare le spalle e richiudile lentamente, evitando di usare lo slancio.';
    if (name.includes('Lat Machine') || name.includes('Trazioni'))
        return name.includes('Trazioni') ? 'Parti da una presa stabile alla sbarra fissa, tira il petto verso la sbarra senza dondolare e scendi lentamente.' : 'Alla lat machine tira l’impugnatura verso la parte alta del petto, senza inclinarti all’indietro per aiutarti, poi lascia risalire il peso lentamente.';
    if (name.includes('Rematore') || name.includes('Pulley'))
        return 'Tieni il busto fermo, porta i gomiti indietro avvicinando il carico al tronco, poi distendi le braccia lentamente senza strattoni.';
    if (name.includes('Alzate Posteriori')) return 'Inclina il busto mantenendo la schiena stabile, apri le braccia lateralmente con gomiti leggermente piegati e torna lentamente. Evita di alzare le spalle e di usare lo slancio.';
    if (name.includes('Alzate Laterali')) return 'Con gomiti appena piegati solleva i manubri ai lati, senza dondolare con il busto. Fermati all’altezza che controlli e abbassa lentamente.';
    if (name.includes('Alzate')) return 'Muovi le braccia con controllo, senza slanci e senza compensare con il tronco.';
    if (name.includes('Leg Curl')) return 'Bacino stabile, fletti il ginocchio portando il tallone verso il gluteo. Torna lentamente senza spingere con il tronco.';
    if (name.includes('Curl')) return 'Piega i gomiti tenendoli il più possibile fermi vicino al corpo. Evita di spingere con la schiena e abbassa lentamente il peso.';
    if (name.includes('Pushdown')) return 'Tieni i gomiti vicini ai fianchi, distendi gli avambracci spingendo l’impugnatura in basso e risali lentamente senza muovere le spalle.';
    if (name.includes('Crunch')) return 'Avvicina lo sterno al bacino contraendo l’addome, senza tirare il collo o aiutarti con le braccia. Torna lentamente alla posizione iniziale.';
    if (name.includes('Squat') || name.includes('Affondi') || name.includes('Leg Press'))
        return 'Mantieni addome attivo e appoggi stabili, scendi con controllo fin dove riesci a conservare la posizione e risali senza rimbalzi. Cerca la stessa profondità in ogni ripetizione.';
    if (name.includes('Stacco')) return 'Porta il bacino indietro mantenendo il peso vicino alle gambe e il busto stabile. Fermati quando non riesci più a controllare la posizione, poi risali estendendo le anche.';
    if (name.includes('Hip Thrust') || name.includes('Glute Bridge'))
        return 'Spingi il pavimento con i piedi e solleva il bacino usando i glutei. Fermati quando tronco e cosce sono allineati, senza inarcare eccessivamente la zona lombare.';
    if (name.includes('Panca')) return 'Mantieni piedi ben appoggiati e scapole stabili sulla panca. Abbassa il peso con controllo e spingi senza perdere l’assetto delle spalle.';
    if (name.includes('Military') || name.includes('Spinte'))
        return 'Tieni addome e glutei attivi, spingi il peso sopra la testa senza inarcare la schiena e abbassalo lentamente mantenendo il controllo.';
    if (name.includes('Calf Raise')) return 'Solleva i talloni spingendo sull’avampiede, fai una breve pausa in alto e abbassali lentamente. Evita di rimbalzare per risalire.';
    if (name.includes('Pallof')) return 'Tieni il cavo di lato, allontana le mani dal petto e resisti alla trazione che vorrebbe ruotarti. Mantieni il busto immobile.';
    if (name.includes('Face Pull') || name.includes('Reverse Fly'))
        return 'Apri le braccia guidando i gomiti verso l’esterno, senza dondolare con la schiena. Controlla il ritorno per mantenere il lavoro sulla parte posteriore delle spalle.';
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
    if (verbose.includes('[SUPERSERIE]')) parts.push('[SUPERSERIE] Superserie (superset): esegui questo esercizio e il successivo senza pausa. Recupera dopo i due esercizi.');
    if (verbose.includes('[TRISET]')) parts.push('[TRISET] Triset (triset): esegui tre esercizi consecutivi senza pausa. Recupera dopo il terzo, poi riparti dal primo.');
    if (verbose.includes('[WARM-UP AUTO]')) {
        const warmup = /\[WARM-UP AUTO\]:?\s*([^|.]+)/.exec(verbose);
        parts.push('[WARM-UP AUTO] Prima del lavoro esegui le serie di avvicinamento: ' + (warmup?.[1]?.trim() || 'aumenta gradualmente il peso senza affaticarti') + '. Sono riscaldamento, non serie allenanti.');
    } else if (verbose.includes('[WARM-UP]')) parts.push('[WARM-UP] Prima del lavoro esegui serie leggere aumentando il peso senza arrivare alla fatica. Non contarle come serie allenanti.');
    if (verbose.includes('[RIFERIMENTO ATLETA]')) {
        const reference = /\[RIFERIMENTO ATLETA\]\s*(\d+(?:[.,]\d+)?)\s*kg/.exec(verbose);
        if (reference) parts.push('[RIFERIMENTO ATLETA] ' + reference[1] + ' kg indicati da te, non verificati nello storico. Controlla nella prima seduta se permettono le ripetizioni con l’RPE richiesto.' +
            (verbose.includes('Peso non prescritto automaticamente') ? ' Non adottati come carico automatico.' : ''));
    }
    if (verbose.includes('[VOLUME INIZIALE]'))
        parts.push('[VOLUME INIZIALE] Si parte con meno serie per verificare la risposta. Non aggiungerne: registra i risultati e rivaluta in seguito.');
    if (verbose.includes('[CALIBRAZIONE MYCOATCH]'))
        parts.push('[CALIBRAZIONE MYCOATCH] Prima settimana: usa pesi gestibili e rispetta ripetizioni e RPE. Registra i risultati, senza provare il massimale.');
    if (verbose.includes('Scarico:') || verbose.includes('🛡️ Scarico'))
        parts.push('SCARICO: settimana per recuperare con meno serie e sforzo. Segui i nuovi target della riga senza aggiungere altro lavoro.');
    const drop = exercise?.sets?.at(-1)?.intensityTechnique;
    if (drop === 'DROP_SET') parts.push('[DROP_SET] [DROP_SCOPE:LAST] Dropset (dropset): solo dopo l’ultima serie riduci il peso ed esegui altre ripetizioni. Registra il nuovo peso a parte.');
    else if (drop === 'REST_PAUSE') parts.push('[REST_PAUSE] Dopo l’ultima serie fai una pausa molto breve, poi completa altre ripetizioni con lo stesso carico finché la tecnica rimane corretta.');
    if (verbose.includes('[ATTREZZATURA DA CONFIGURARE]'))
        parts.push('Carico non assegnato: indica nel diario il peso e il diametro del bilanciere che usi, insieme ai dischi disponibili. Verifica poi quale peso totale puoi caricare realmente.');
    else if (verbose.includes('non è componibile'))
        parts.push('Carico da verificare: il peso proposto non si ottiene esattamente con i dischi registrati. Scegli un peso davvero componibile e rispetta le ripetizioni e l’RPE della scheda.');
    else if ((exercise.kgMin === '' || exercise.kgMin == null) &&
        exercise.equipment !== 'bodyweight')
        parts.push('Carico da scegliere: dopo il riscaldamento usa un peso con cui completi le ripetizioni previste rispettando l’RPE (8 ≈ 2 ripetizioni ancora possibili). Annota kg, ripetizioni e RPE reali.');
    parts.push(cue(exercise));
    // The legacy 12-column CSV must not gain a pseudo-separator in Note.
    return note;
}

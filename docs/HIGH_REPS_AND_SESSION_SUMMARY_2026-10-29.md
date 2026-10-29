# MyCoatch 1.5: progressione oltre 12 reps e conclusione della seduta

Questa revisione sostituisce il precedente blocco degli aumenti nei range il cui massimo supera 12 ripetizioni. La stima e1RM resta esclusa per questi target.

## Progressione
- Serie ordinarie, confermate e confrontabili, RPE registrato tra 6 e il massimo prescritto, nessuna serie sotto il minimo del range: stesso carico e una ripetizione in più in una sola serie sotto il massimo. Ripetizioni proposte sempre entro il range.
- Tutte le serie del blocco al massimo (o fino a due reps oltre), a pari carico e con RPE entro obiettivo: piccolo incremento e obiettivo al limite basso del range. Non è una garanzia di riuscita della prossima seduta.
- Incremento indicativo del 2,5% (5% per manubri senza inventario), oppure passo dichiarato quando compatibile. Limite applicativo del 5%, non una soglia fisiologica validata. Un passo noto troppo grande non forza il salto: resta una proposta teorica piccola, con disponibilità da verificare e segnalazione se non componibile con l'inventario dichiarato.
- RPE mancante, alto o insufficiente per questa valutazione, serie incomplete, dolore/readiness sfavorevole, esclusione o scarico impediscono la progressione. Carichi diversi e ripetizioni alte fisse conservano il riferimento, senza inventare un nuovo range. Top set, back-off e tecniche speciali conservano percorsi dedicati.
- Ripetizioni basse e miste fino a 12 mantengono la logica precedente. Lo storico per posizione, le correzioni manuali e le prescrizioni originali restano conservati. Un render o una sincronizzazione non devono moltiplicare l'aumento.
- Motore principale e suggerimenti secondari condividono la decisione sulle alte ripetizioni; nessun aumento in base al solo calcolo del massimale. Le proposte rimangono distinte dai risultati confermati.

## Interfaccia
- Tasto sotto il nome dell'esercizio: «Salta solo quest'allenamento se hai problemi», arancione chiaro, testo a capo e tema scuro leggibile. Quando escluso, resta «Ripristina esercizio». Rimangono nota personale obbligatoria, ripristino e conservazione delle serie già svolte.
- Il check che completa realmente il lavoro giornaliero apre il riepilogo e scorre al suo pulsante. Prima si apre il contenuto, poi si esegue lo scorrimento; il precedente scorrimento verso il pannello chiuso è rimosso.
- Movimento ridotto rispettato. Consultazione o render ripetuti non avviano lo scorrimento; togliere e riconfermare l'ultima serie può concludere nuovamente la seduta. Warmup e serie saltate non vengono segnate artificialmente come eseguite.

## Verifica
Test Node e browser isolati con dati sintetici e Supabase bloccato; nessuna modifica al database o alle policy SQL. Copertura di kg/reps, assenza di e1RM per target alti, passi piccoli/grandi, dati incompleti, specialità, note e valori manuali, idempotenza, tasto su 320 px nei due temi, apertura/scorrimento una volta sola e completamento con esclusioni/warmup.

Versione webapp 1.2.7-20261029, cache PWA v79, protocollo 1.5.

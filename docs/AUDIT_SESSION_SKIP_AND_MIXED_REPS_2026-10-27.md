# Esclusione della singola seduta e progressione con reps miste

Base: main 0f0145bf (PR99). Versione 1.2.5-20261027, cache v77.

## Esclusione esplicita, distinta dal riscaldamento

Ogni esercizio di lavoro ha «Salta per questa seduta» e «Ripristina esercizio». Richiede un motivo non vuoto nel campo esistente userNotes; non introduce una seconda nota duplicata né analizza il testo per diagnosticare dolore. Il campo rimane accessibile anche dopo l'esclusione e, su richiesta dell'utente, le note degli esercizi esclusi sono l'eccezione alla sola lettura del mesociclo bloccato. Serie, esclusione e prescrizioni rimangono bloccate. L'editing non può salvare una nota vuota mentre l'esclusione è attiva; se il campo viene lasciato vuoto si conserva e ripristina l'ultimo motivo valido.

sessionSkip è un metadato della singola occorrenza, salvato con note e diario nella transazione esistente. Nessuna migrazione Supabase. Non modifica isWarmup/isExcluded né spunta serie non eseguite. Conferme precedenti conservate. Salvataggio fallito: nessuna esclusione confermata. Ripetere la seduta archivia lo stato precedente e riabilita l'esercizio per la nuova esecuzione; le settimane successive non ereditano l'esclusione.

Conteggi, fine seduta, navigazione e circuiti distinguono serie valide confermate, saltate e dati invalidi: un check malformato non può essere nascosto dall'esclusione. Il timer della sessione termina quando il lavoro rimanente è risolto; saltare un esercizio diverso da quello attivo non interrompe il recupero in corso. Anche una seduta interamente saltata può essere conclusa, senza inventare serie, tonnellaggio o minuti di allenamento.

Il riepilogo riporta motivo ed eventuali serie già eseguite. La chiusura del mesociclo distingue sedute integralmente svolte da quelle concluse con esclusioni; il volume non svolto non diventa lavoro eseguito. Le esposizioni saltate non autorizzano progressioni o valutazioni di stallo. PDF completo del mesociclo: dicitura esplicita di esclusione e note personali complete, già gestite con ritorno a capo e paginazione dal renderer esistente. Anche il PDF giornaliero include l'indicazione.

## Progressione 5–7–7 con target 5–6

La normale progressione per tutte le serie al limite superiore resta operativa (6–7–7). Per risultati misti servono almeno due serie oltre il massimo, tutte confermate e valide, carico effettivo omogeneo, nessuna tecnica speciale, target variabile fino a 12 e RPE misurati entro target. Tutte le stime devono essere utilizzabili. Il limite sostenibile deriva dalla capacità MINIMA fra le serie, non dalla media; dopo l'arrotondamento il peso viene verificato di nuovo. Si riparte dal limite basso del range. RPE mancante/oltre target, dolore, readiness prudente e scarico mantengono i rispettivi veti.

Esempio sintetico: 80 kg, 5–7–7 @7, target 5–6 @7,5 e step 1 kg → 81 kg × 5. Se la prima serie di 5 reps è già @7,5, niente aumento di kg: una ripetizione aggiuntiva proposta alla prima serie. Nessuna certezza fisiologica: è una regola prudente dell'app, basata su una stima soggettiva, che l'atleta verifica e conferma. Il messaggio non afferma falsamente che tutte le serie hanno raggiunto il massimo. Reps fisse, top/back-off, range oltre 12 e tecniche speciali conservano le politiche specifiche.

## Collaudo

Test di regressione per obbligo nota, distinzione da W, conservazione dei check, conteggi, ripristino/archivio, PDF e report, esclusione dalle evidenze e progressione mista con vincolo della serie meno favorevole. Browser isolato da Supabase: obbligo nota, reload, svuotamento respinto, chiusura/ripristino, nota modificabile a mesociclo bloccato, precompilazione e circuiti. Nessun dato del diario personale usato o alterato.

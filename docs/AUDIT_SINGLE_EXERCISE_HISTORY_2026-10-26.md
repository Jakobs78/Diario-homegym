# Note della scheda, consigli e ultima seduta — 26 ottobre 2026

## Risultato

Un solo pannello aperto contiene «Note della scheda» e «Consigli di MyCoatch», con titoli in neretto. Le sezioni senza contenuto e il pannello completamente vuoto vengono nascosti. Le note personali rimangono disponibili sotto alle celle della seduta attuale.

L'ultima seduta è rappresentata una sola volta, prima delle celle, con data quando registrata, settimana/giorno e tabella compatta serie/kg/reps/RPE. Sono eliminati i due menu annidati delle superserie e la ripetizione delle prestazioni nel consiglio. Gli indici delle serie rimangono quelli originali, anche quando un riscaldamento è escluso. Il riferimento del consiglio viene identificato separatamente soltanto se proviene da una seduta diversa dall'ultima visualizzata; non viene replicata la tabella dei risultati.

I messaggi delle proposte sono brevi e corrispondono alle celle: per esempio «Ho aggiunto una ripetizione alla serie 1: 15 kg × 12 reps.». Nessuna frase aggiuntiva sul fatto che i valori siano precompilati. La disponibilità dell'attrezzo non viene messa in dubbio con un avviso generico se mancano dati d'inventario; restano gli avvisi concreti per un carico non componibile con un inventario dichiarato. I messaggi di cautela e dolore restano attivi.

Se l'utente ha inserito valori differenti, il testo usa «Suggerisco…» e non afferma di aver applicato una correzione. La proposta non viene salvata come risultato: la spunta mantiene il proprio significato di conferma dell'esecuzione reale.

## Confini

Nessuna modifica a generazione, protocollo numerico, riconciliazione, precompilazione, eventi di registrazione, archiviazione, timer o sincronizzazione. La ricerca della precedente esecuzione usa la stessa funzione `trainingExposures` già richiamata da `findPreviousExercise`, conservando anche le coordinate per l'etichetta della seduta. I testi originali dello storico e delle note non vengono riscritti dal renderer.

La precompilazione del protocollo era già presente: viene verificata e resa coerente con la comunicazione, senza introdurre una nuova regola di progressione.

## Verifiche locali

- 576 test Node superati, compresi i casi di testo coerente con i valori manuali e di riferimento a una seduta diversa.
- 116 test browser della suite completa superati, con dati isolati e richieste Supabase bloccate.
- Caso dedicato: 3 serie da 11 reps confermate, range 10–12 e RPE compatibile → celle 12–11–11, carichi pertinenti per serie, nessun risultato inventato; la modifica manuale a 11 resta mantenuta e il messaggio diventa una proposta.
- Controlli visivi a 390 px e 320 px, tema chiaro e scuro. Ulteriore verifica mirata dopo la correzione della larghezza della tabella dello storico.

Rilascio: 1.2.2-20261026, cache PWA v74. Nuovo modulo di presentazione `js/exerciseHistoryUI.js` incluso nella cache.

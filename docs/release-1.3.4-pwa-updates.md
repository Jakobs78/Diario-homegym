# HomeGym Diary 1.3.4 — aggiornamenti dell’app installata

La precedente cache PWA poteva lasciare la nuova release in attesa delle finestre ancora aperte. La registrazione avveniva solo al caricamento e il vecchio avviso poteva non collegarsi al service worker. Chiudere e riaprire l’app non garantiva quindi il passaggio alla nuova versione.

- Il nuovo worker scarica prima l’intero bundle, evitando la cache HTTP, poi può attivarsi anche in presenza di documenti precedenti. Ogni documento aperto conserva il proprio bundle statico; la nuova navigazione riceve quello corrente. Nessuna seduta viene ricaricata automaticamente.
- Migrazione dalle versioni precedenti senza richiedere un comando che queste non avevano: un’apertura online scarica la release, la successiva apertura carica il nuovo bundle.
- Controllo all’avvio, al ritorno nell’app e al ripristino della connessione; comando «Controlla aggiornamenti» in Strumenti e gestione. L’avviso offre «Aggiorna ora» e «Più tardi».
- «Aggiorna ora» attende le scritture del diario e della coda offline, richiede l’attivazione di un eventuale worker in attesa e verifica il controller prima di ricaricare. Un errore di salvataggio o di attivazione lascia la schermata aperta.
- Le cache ancora usate da documenti aperti vengono conservate; si eliminano solo le generazioni precedenti non necessarie. Un vecchio worker non può eliminare la cache di una release successiva durante l’installazione.
- Nessuna cancellazione di diario, account, tema, timer o coda di sincronizzazione. Nessuna modifica a schema dati, calcoli MyCoatch o protocollo di sincronizzazione. Le richieste API mantengono gli errori reali della rete.
- Header Vercel per rivalidare documento e worker; manuale aggiornato.

Versione app 1.3.4-20261104, cache PWA v86. Prove con Chromium e WebKit: passaggio dalla v83 del 31 ottobre con due finestre aperte, bundle coerenti, diario e coda IndexedDB conservati, tema e scadenza timer conservati, riapertura offline, download interrotto e successivo recupero, aggiornamento futuro confermato dall’utente e rifiuto sicuro se il salvataggio fallisce. WebKit viene incluso nella verifica automatica del ciclo PWA; queste prove non sostituiscono una verifica fisica sull’iPhone dell’utente.

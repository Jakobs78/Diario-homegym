# HomeGym Diary 1.3.5 — attrezzatura e seduta guidata

## Manubri posseduti

In Strumenti e gestione → Attrezzatura si aggiungono manubri con peso per singolo pezzo e quantità, accanto a bilancieri e dischi. Per i regolabili si indicano i carichi ottenibili e quanti manubri sono preparabili contemporaneamente. I duplicati vengono rifiutati; pesi a scatti di 0,25 kg e quantità intere 0–24. L’elenco completo richiede conferma: i vecchi pesi mantengono il comportamento precedente senza inventare quantità. Un elenco confermato vuoto indica assenza di manubri.

Le verifiche dei carichi distinguono un pezzo dalla coppia, anche per gli esercizi unilaterali delle gambe che richiedono due manubri. Inventario incluso nel diario, backup, sincronizzazione e copie dell’attrezzatura nelle anteprime, senza nuove tabelle o API.

## Riepilogo e check-in

Apertura del riepilogo indipendente per account, mesociclo, settimana, giorno e nuova esecuzione della seduta, ricordata sul dispositivo. Apertura automatica alla conferma finale della seduta. «Inizia seduta» propone il check-in; «Salta per oggi» memorizza una condizione non valutata e permette di procedere. Non si ripete il questionario a ogni riapertura. Ripetere una seduta azzera la scelta della precedente esecuzione, conservata nell’archivio insieme ai risultati.

## Recupero dopo la chiusura

La scadenza del recupero è persistente e associata ad account e seduta. Una nuova finestra riprende il tempo restante senza estenderlo; una scadenza già superata mostra brevemente «Recupero concluso». Il comando × annulla il timer. Le precedenti scadenze sessionStorage restano recuperabili nella stessa finestra.

## Avvicinamento W

I principali esercizi con bilanciere o manubri mostrano una sezione di riscaldamento prima delle serie allenanti: normalmente due serie, una se lo stesso schema è già stato riscaldato nella giornata. Kg interi, compatibili con l’inventario quando conosciuto; carichi sconosciuti lasciati da scegliere. Si possono correggere kg e reps, confermare, aggiungere serie fino a cinque oppure saltare l’avvicinamento. Le registrazioni hanno `isWarmup: true`, restano separate dai risultati allenanti e non condizionano volume, progressioni o completamento. Ripetere la seduta conserva il vecchio riscaldamento nell’archivio e lo azzera per la nuova esecuzione. Le proposte generate includono l’avvicinamento nella stima dei tempi.

## Limite dei manubri e rematore al cavo

Nuova variante con identità distinta: Rematore Unilaterale al Cavo Basso. Richiede cavo basso e maniglia singola dichiarati nel configuratore. Alla generazione successiva, dopo un mesociclo completo, il rematore a un braccio può essere sostituito se tutte le ultime serie valide hanno raggiunto il massimo manubrio posseduto, il limite alto delle reps e l’RPE previsto. Serie incomplete, dolore, assenza di RPE, un peso più alto posseduto o attrezzatura incompatibile non autorizzano il cambio. La variante al cavo parte senza kg prescritti, da calibrare separatamente; motivo visibile nell’anteprima. Il mesociclo sorgente e il suo storico non vengono modificati.

Manuale aggiornato nella stessa pagina. Versione app 1.3.5-20261104, cache PWA v87. Prove con dati sintetici: nessun account reale, nessuna modifica al database remoto. Copertura di inventario, copie dell’attrezzatura, separazione dei giorni, check-in facoltativo, nuova finestra senza sessionStorage, avvicinamento escluso dal lavoro e sostituzione solo nella nuova proposta.

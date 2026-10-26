# Riepilogo della seduta — 26 ottobre 2026

## Comportamento

Il menu «Riepilogo seduta» conserva conteggio delle serie e barra di avanzamento. A seduta completata con tutte le serie allenanti confermate e dati kg/reps validi, il pulsante assume uno sfondo verde tenue anche da chiuso. Togliere una spunta, navigare a una giornata incompleta o trovare dati non validi rimuove l'evidenziazione. Il colore indica completamento, non una valutazione positiva della prestazione.

Sono rimossi il titolo interno duplicato e i quattro riquadri con tempo, previsione, tonnellaggio e copertura RPE. I valori e le relative funzioni di calcolo restano nel modello per le altre funzionalità. Il cronometro della seduta rimane nell'intestazione, senza una seconda copia nel riepilogo.

Il check-in resta disponibile prima e durante l'allenamento, con salvataggio e influenza sulle proposte invariati. A seduta conclusa scompare il modulo: eventuali segnalazioni di dolore/prudenza già registrate rimangono nel report. Se la seduta viene riaperta togliendo una spunta, il check-in torna disponibile con le risposte conservate. La calibrazione attiva mantiene il proprio riepilogo; nel report finale rimangono solo eventuali riferimenti iniziali ancora mancanti.

## Feedback per esercizio

Il report riporta reps e RPE percepito rispetto ai target di ciascuna serie, inclusi top set, back-off e range. Non usa la media RPE dell'esercizio per dichiarare il rispetto dei target: scostamenti opposti non si annullano. Il confronto individua serie sotto/oltre obiettivo, RPE superiore/inferiore al previsto, dati mancanti e prescrizioni non disponibili. RPE 10 programmato viene rispettato. Le tecniche speciali conservano la propria notazione senza confronto numerico ingenuo delle reps. Riscaldamenti e righe non confermate non diventano risultati validi.

Una proposta successiva viene mostrata soltanto se già presente nella prima esposizione futura ancora aperta, collegata attraverso `basedOn` alla seduta attuale e con evidenza ancora corrispondente ai risultati confermati. Non viene inventato un aumento da una buona prestazione. Valori manuali differenti sono segnalati e preservati; proposte con fonti archiviate, estranee o modificate non vengono attribuite alla seduta. I mesocicli bloccati/conclusi non espongono queste proposte come aggiornamenti futuri.

I messaggi popup rimangono riservati agli errori che impediscono la conferma e durano 10 secondi, con chiusura manuale. Il messaggio inline resta consultabile dopo la chiusura. Le spunte valide non reintroducono popup ripetitivi; i consigli restano nelle card.

## Confini e verifica

- Nuovi moduli di sola lettura: `mycoatch/sessionFeedback.js` e `js/sessionFeedbackUI.js`.
- Nessuna modifica al protocollo numerico, riconciliazione, precompilazione, salvataggio, sincronizzazione, calcoli LIVE, gestione del recupero o dati storici. Il richiamo del cronometro duplicato è eliminato da `ui.js`; l'export compatibile per `sessionTimer.js` resta disponibile senza ricostruire il report a ogni tick.
- 584 test Node superati, inclusi 8 casi dedicati al report e alla provenienza delle proposte.
- Suite browser: 118 casi; il primo passaggio completo supera 117 casi e identifica un'asserzione rimasta sul riquadro RPE esplicitamente rimosso. Il controllo viene aggiornato per verificare il conteggio reale nel modello, senza ripristinare il riquadro.
- Quattro verifiche browser mirate superate dopo l’aggiornamento dell’asserzione: tutti i 118 casi della suite risultano verificati con successo.
- Verifiche mirate: confronto per serie su smartphone, verde e rimozione del verde, check-in disponibile soltanto durante la seduta, proposta 11–11–11 → 12–11–11 realmente presente, dati non confermati preservati, popup visibile a 9 secondi e chiuso a 10, chiusura manuale, assenza di popup a ogni spunta valida.
- Controlli visivi a 390 px e 320 px, tema chiaro/scuro. Dati sintetici isolati con richieste a Supabase bloccate; nessun accesso autenticato al diario personale.

Rilascio 1.2.3-20261026, cache PWA v75 con entrambi i nuovi moduli.

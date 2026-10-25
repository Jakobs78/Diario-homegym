# Note e aggiornamenti MyCoatch — 25 ottobre 2026

## Problema e comportamento

La card esponeva note importate, note adattive, suggerimenti fra esposizioni e riepiloghi dello storico in contenitori diversi. Il riepilogo LIVE ripeteva i consigli degli esercizi e una conferma produceva un ulteriore popup temporaneo.

Ora ogni esercizio ha una sola sezione sempre visibile «Istruzioni e aggiornamenti». Le indicazioni tecniche importate sono mantenute. Variazioni effettive di kg/reps, calibrazione necessaria, dolore, difficoltà e problemi concreti con i carichi rimangono visibili nella stessa sezione. Gli aggiornamenti uguali sono raggruppati indicando le serie; quelli per serie con obiettivi diversi restano distinti. Nessun messaggio sostitutivo se non c'è nulla da comunicare.

Sono omessi dalla presentazione conferme ordinarie, ripetizioni dello stesso carico, monitoraggio stabile e metadati del generatore già rappresentati altrove. Le richieste di calibrazione obsolete scompaiono quando i carichi sono già disponibili. Testi originali, risultati ed esportazioni non vengono riscritti dal filtro.

Le superserie mantengono le istruzioni fuori dai menu dello storico. Lo storico effettivo resta consultabile separatamente. Il riepilogo generale conserva check-in, metriche, calibrazione, problemi globali e resoconto finale; non replica le indicazioni per ciascun esercizio. I popup sono riservati agli errori che impediscono di registrare una serie.

## Perimetro

La nuova politica è nel modulo puro `mycoatch/coachCommunication.js`; il rendering condiviso è in `js/exerciseCoachUI.js`. La presentazione ricalcola il contenuto quando cambiano i dati, senza ricreare il campo delle note personali né riannunciare un testo identico. I testi sono inseriti con `textContent`.

Restano invariati `protocolLoad.js`, `trainingPlan.js`, `liveCoach.js`, precompilazione, eventi di registrazione, timer, archiviazione e sincronizzazione. Il bottone facoltativo delle vecchie schede valuta ancora il consiglio originale, ora per lo stesso esercizio della card. Le proposte del protocollo continuano a popolare le celle attraverso il percorso già esistente.

## Validazione

- 574 test Node, inclusi 9 test della politica di comunicazione.
- Suite browser completa e collaudi specifici: aggiornamenti persistenti senza popup, visibilità fra serie e navigazione, deduplicazione, assenza di messaggi ordinari, focus mantenuto, testi importati sicuri, superserie e viewport da 320 px.
- I dati di collaudo sono sintetici e isolati; le richieste a Supabase sono bloccate. Non si tratta di un accesso autenticato al diario personale.

Rilascio: 1.2.1-20261025, cache PWA v73 con entrambi i nuovi moduli.

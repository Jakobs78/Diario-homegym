# HomeGym Diary 1.3.5 — manubri posseduti

In Strumenti e gestione → Attrezzatura, accanto a bilancieri e dischi, è disponibile l’elenco dei manubri: peso per singolo pezzo e quantità, con aggiunta e rimozione delle righe. Per i regolabili si indicano i carichi ottenibili e il numero di manubri preparabili contemporaneamente a quel peso. I duplicati vengono rifiutati; i pesi sono ammessi a scatti di 0,25 kg e le quantità intere da 0 a 24.

L’elenco completo deve essere confermato esplicitamente. I vecchi pesi senza quantità restano leggibili e mantengono il comportamento precedente finché l’utente non conferma l’inventario; nessuna coppia viene presunta. Un elenco confermato vuoto rappresenta assenza di manubri. Togliere la conferma riporta la disponibilità a sconosciuta.

Le verifiche dei carichi distinguono gli esercizi con un solo manubrio da quelli con due dello stesso peso; un esercizio unilaterale per le gambe può comunque richiederne due. L’inventario prevale sui vecchi elenchi senza quantità ed entra nelle copie dell’attrezzatura associate alle anteprime MyCoatch, invalidandole se cambia. Diario, backup e sincronizzazione esistenti conservano il nuovo campo senza nuove tabelle o modifiche alle API.

Questa release aggiunge l’inventario e il suo uso nella verifica dei carichi. Non cambia il mesociclo in corso e non introduce ancora la sostituzione automatica del rematore nel ciclo successivo, né le altre proposte discusse su riepilogo, check-in, timer o avvicinamento.

Manuale aggiornato. Versione app 1.3.5-20261104, cache PWA v87; prova del ciclo PWA resa indipendente dal nome della cache della singola release. Verifiche con dati sintetici, senza account o dati reali: validazione, quantità per singolo/coppia, copie dell’attrezzatura, persistenza alla riapertura e layout a 320 px.

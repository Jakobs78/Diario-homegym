# HomeGym Diary 1.3.1 — progressione e segnalazioni per serie

## Correzioni

- Una seduta futura che mantiene il carico, ad esempio per recupero differente, non consuma la progressione destinata alla successiva seduta idonea. Non duplicare l'aumento in ogni settimana senza nuove prestazioni.
- Il riepilogo cerca le proposte effettivamente applicate anche oltre una prima occorrenza invariata e ne indica settimana e giorno.
- Per serie omogenee una serie marcata «Carico trovato: serie valida» può fornire il riferimento comune. Non scegliere automaticamente massimo volume o massimo peso. Senza chiarimento i pesi diversi non ricevono aumenti indipendenti automatici; le differenze prescritte tra top set e back-off restano rispettate.
- La dimensione degli aumenti a reps basse/moderate considera la capacità stimata dalle serie valide, i target e un limite prudente. È visibile un intervallo operativo anche con reps a range; resta una stima, non una misura clinica o un test 1RM. Le alte reps mantengono la progressione diretta senza ricorrere alla formula del massimale.

## Segnalazioni

Ogni serie confermata può essere annotata come: carico trovato, dolore improvviso, distrazione, problema di esecuzione, variazione intenzionale o altro, con nota facoltativa. Le annotazioni restano distinte da kg/reps/RPE e dalle note dell'esercizio.

Dolore, distrazione e problema di esecuzione escludono solo la serie dalle stime e dai confronti di prestazione. Non cancellano il risultato, non la trasformano in warm-up e non attivano l'esclusione dell'esercizio. Il lavoro eseguito rimane nel diario e nei conteggi del lavoro registrato. Una segnalazione di dolore impedisce di dedurre un incremento automatico dalla sola altra serie valida.

Dopo l'ultima conferma di un esercizio, se ci sono variazioni rilevanti non previste fra serie omogenee, la card mostra un chiarimento persistente. Le soglie (oltre 10% fra pesi, oppure caduta di almeno due reps sotto il minimo) sono criteri software di visualizzazione, non diagnosi o confini fisiologici. Il pannello non impedisce di proseguire: «Rispondo dopo» conserva i dati e rinvia la risposta. Una domanda irrisolta può essere richiamata nella successiva esposizione; una prestazione più recente uniforme la rende superflua.

La scelta del motivo salva subito l'annotazione; il pannello resta aperto per annotare più serie e aggiungere note, poi «Conferma segnalazioni» permette di proseguire. Le segnalazioni restano consultabili in storico, riepilogo e PDF del diario; il backup JSON conserva gli stessi metadati. Ripetere una seduta archivia i motivi precedenti e li azzera solo sulle nuove serie.

## Protezioni

Campi manuali e serie confermate non vengono riscritti dal coaching. Una modifica del motivo invalida i riferimenti precedenti per evitare che una proposta già calcolata continui a usare una serie ora esclusa. Non vengono modificati risultati reali sul server durante sviluppo e test. Nessuna modifica SQL, whitelist o pagamenti richiesta: i nuovi metadati fanno parte del diario JSON esistente.

Test: regressioni squat Lower A/Lower B, riepilogo, alte reps, calibrazione 80/95, dolore/distrazione, top/back-off, stabilità al ricalcolo, persistenza delle segnalazioni, backup e ripetizione della seduta. Versione 1.3.1-20261031; cache PWA v83; protocollo MyCoatch 1.7.

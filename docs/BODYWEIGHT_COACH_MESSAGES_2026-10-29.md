# Corpo libero e messaggi MyCoatch — 1.2.9 / protocollo 1.6

Intervento richiesto dopo lo screenshot del walkout con storico 1 kg e 6/8 reps: il proprietario aveva inserito 1 kg come valore di comodo temendo problemi con lo zero.

## Comportamento

- Zero valido per esercizi identificati a corpo libero, anche tramite associazione confermata o attrezzatura esplicita. Zero non diventa valido per panca, squat o altri esercizi con pesi.
- Il catalogo identifica il walkout senza sovraccarico: nelle nuove proposte usa 0 kg, senza riscrivere risultati confermati. Una prescrizione esplicita di sovraccarico o i campi manuali continuano ad avere precedenza.
- Lo storico 1 kg × 6/8 @8 su un target 6–10 @8,5 produce 0 kg × 7/8, se recuperi e prescrizioni lo consentono e non ci sono controindicazioni registrate. Una sola serie aumenta di una ripetizione per esposizione; tutte le serie devono supportare la proposta.
- Nessun massimale stimato dal solo sovraccarico esterno e nessun confronto con inventario/dischi negli esercizi a corpo libero, anche quando trazioni o dip hanno carichi aggiuntivi registrati. Il peso corporeo non viene inventato.
- Al limite alto del range non si aggiungono automaticamente kg agli esercizi a corpo libero. RPE mancante, recupero cambiato, deload o check-in non favorevole impediscono la progressione automatica delle reps. Dolore resta un’avvertenza pertinente.
- La seconda serie conserva il proprio riferimento storico dopo una prima serie regolare: 7/8 non diventa 7/7 per mera copia dell’ultima riga. Uno sforzo superiore al target può proporre meno reps, restando nel range.
- Dati manuali, serie confermate e diario storico non vengono convertiti o ripuliti automaticamente. Il generatore continua a escludere questi esercizi secondo la politica già presente; le schede importate restano utilizzabili.

## Presentazione

- Stessa famiglia di caratteri dell’app, dimensione e peso normale per il testo di consigli, avvertenze, riepiloghi e spiegazioni dell’analisi. Grassetto limitato a titoli ed etichette brevi delle modifiche.
- La progressione ordinaria resta informativa, senza simbolo di allarme.
- Nessun messaggio per una serie semplicemente riproposta. Per il caso dello screenshot: un solo aggiornamento sulla prima serie, con indicazione del corpo libero e dello zero.
- Eventuali problemi reali di inventario per esercizi con pesi sono separati dalla spiegazione della progressione e raggruppati per le serie interessate, senza ripetere l’intero ragionamento.
- Inserimento DOM mediante textContent/createTextNode: nessuna interpretazione HTML dei messaggi o dei nomi importati.

## Validazione e pubblicazione

Test unitari e di integrazione comprendono zero, alias confermati, storico a 1 kg conservato, precompilazione, consigli, stime, inventario, carichi aggiuntivi reali, valori manuali e segnalazioni duplicate. Test browser isolato a 320 px riproduce lo screenshot e conferma entrambe le serie a 0 kg senza alterare lo storico.

Nessuna modifica SQL o al diario reale dell’utente. Versione app 1.2.9-20261029; cache PWA v81. I cambiamenti al protocollo riguardano il trattamento del corpo libero, non le precedenti regole di progressione con i pesi.

# HomeGym Diary 1.3.0 — 31 ottobre 2026

## Comportamento

- Il diario operativo contiene scheda, risultati, note, proposte correnti e variazioni tecniche compatte. Gli aggiornamenti precedenti con copie complete delle proposte vengono conservati integralmente in `workout_coach_archives`, fuori dal trasferimento ordinario del diario.
- La conversione avviene al salvataggio sul dispositivo: archivio e riferimento sono scritti nella stessa transazione IndexedDB. Il cloud riceve l'archivio prima del diario che lo cita. I caricamenti degli archivi sono riconoscibili dopo una conferma persa e non si ripetono nei salvataggi successivi.
- I nuovi eventi tecnici descrivono soltanto i valori modificati per serie. Oltre 30 eventi o 32 KiB nel mesociclo, quelli precedenti vengono archiviati separatamente e restano nel diario gli ultimi cinque. Nessun risultato o nota viene rimosso.
- Il backup JSON integrale include anche gli archivi tecnici, recuperandoli dal cloud se necessario. Se non sono recuperabili, l'esportazione si ferma esplicitamente senza produrre un backup presentato come completo. Il ripristino conserva gli archivi dell'account originale.
- Il diario operativo continua a essere inviato come snapshot atomico con confronto della revisione server. Non è un merge per singola serie: l'archiviazione separata elimina il principale costo superfluo senza cambiare le garanzie di concorrenza.

## Affidabilità

- Prova SHA-256 canonica salvata prima di ogni scrittura, conservata in caso di esito incerto, anche quando una nuova modifica sostituisce la precedente nella coda. Recupero automatico solo per contenuti identici o riconosciuti come invii già applicati. Le revisioni estranee restano conflitti da verificare.
- Confronto JSON indipendente dall'ordine delle proprietà; ordine delle serie significativo.
- Coda riprocessata fino a esaurimento, senza eliminare azioni di altri account o modifiche arrivate durante la rete. Nuovi tentativi automatici da 2 a 60 secondi dopo errori temporanei; rete e visibilità possono sospenderne l'esecuzione.
- Timeout delle richieste API/autenticazione di 25 secondi; le modifiche rimangono salvate localmente.
- Input salvati localmente senza il precedente timer di due secondi. Solo l'invio cloud attende 1,5 secondi dall'ultima modifica.
- Pull simultanei dello stesso account e riattivazioni focus/visibilità condividono le richieste in corso. Le verifiche ordinarie leggono soltanto la revisione prima di scaricare un diario cambiato.

## Interfaccia

- Versione in uso visibile sotto il nome dell'app e avviso di aggiornamento in attesa. Fonte unica: `CONFIG.APP_VERSION`.
- Stato distinto per invio, attesa, offline, autenticazione da verificare e conflitto. Ora dell'ultima conferma disponibile nel dettaglio.
- Titolo neutro «Versioni del diario da verificare», senza dedurre due dispositivi.
- Consigli MyCoatch sintetici e raggruppati per modifica concreta; carattere uniforme, enfasi limitata alle etichette. Calcoli e regole di progressione invariati.

## Database e pubblicazione

È stata applicata la migrazione Supabase `separate_immutable_coach_archives`. Schema documentato in `docs/supabase-coach-archives.sql`. RLS obbligatoria con proprietario `auth.uid()`, nessun accesso anonimo e nessuna modifica consentita agli archivi già inseriti. Eliminazione con account tramite FK; eliminazione del diario include gli archivi. Nessuna modifica alle politiche del diario, whitelist o pagamenti.

Test SQL in transazione annullata: proprietario legge/inserisce, altro utente non legge/inserisce, anonimo non legge. Nessun diario reale modificato durante lo sviluppo.

L'eventuale conflitto già presente non viene risolto scegliendo automaticamente una versione diversa. Non cancellare IndexedDB, dati dell'app o token per installare l'aggiornamento. Il service worker attende la chiusura delle finestre prima di attivarsi, così non sostituisce il codice durante una seduta.

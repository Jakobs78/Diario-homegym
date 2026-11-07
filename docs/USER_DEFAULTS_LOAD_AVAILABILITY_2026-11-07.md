# Profilo personale e disponibilità dei carichi — 7 novembre 2026

## Comportamento

- Un peso suggerito in base alle prestazioni resta un riferimento visibile anche se l’inventario non lo conferma. Il coach può preferire un peso disponibile entro gli stessi limiti della progressione; quando non esiste, mantiene la proposta teorica e segnala l’incertezza.
- Il calcolo dei dischi e delle quantità effettivamente disponibili resta distinto: non vengono inventati dischi, coppie di manubri o bilancieri compatibili.
- L’utente può cambiare il peso nelle serie. La conferma registra quello effettivamente eseguito; una proposta non diventa una prestazione.
- Ripetizioni, RPE, qualità dei dati, dolore, scarico e recuperi restano condizioni della progressione. L’assenza di attrezzatura non viene confusa con una prestazione insufficiente.

## Profilo e primo utilizzo

Nei nuovi diari incompleti compare «Configura profilo». Il modulo chiede età, dotazione, panche/accessori e macchine. Non inventa età o attrezzi mancanti. «Salva e configura pesi» apre il modulo di inventario già esistente, conservando i valori precedenti.

Chi possiede già uno storico non riceve un nuovo riquadro sopra la seduta: trova «Profilo personale» in Strumenti, con indicazione dei dati da completare. L’inventario numerico resta in «Attrezzatura personale».

I valori sono salvati nel diario dell’utente, sotto `athlete.userDefaults`, e vengono riletti alla successiva apertura di MyCoatch. Le preferenze già salvate nel registro del profilo continuano a funzionare. Un aggiornamento del modulo completo aggiorna anche i valori predefiniti; l’aggiornamento delle impostazioni personali conserva le revisioni del profilo già esistente. Non cambia i risultati o le schede precedenti.

La generazione senza allenamenti pregressi conserva comunque il profilo e l’inventario: un diario con soli dati personali non viene sostituito con un oggetto vuoto.

## Salvataggio e isolamento

Si usa la transazione del diario già esistente, con gli stessi controlli di proprietario, sincronizzazione e backup. Non sono state cambiate query, policy RLS, autenticazione o schema Supabase. Non viene creato un archivio parallelo e non si duplicano i dati dell’attrezzatura in ogni serie. Il modulo aperto viene chiuso se cambia l’account.

Sono stati verificati, con dati isolati, persistenza dopo reload, conservazione dell’inventario, riutilizzo nel modulo MyCoatch, aggiornamento dell’età, chiusura dell’editor al cambio utente e conferma manuale di un peso fuori inventario. Le prove browser bloccano l’accesso al servizio remoto e non modificano diari reali.

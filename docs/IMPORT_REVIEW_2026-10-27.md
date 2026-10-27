# Importazione schede: semplificazione e associazioni prudenti

## Decisione autorizzata
Rimuovere il builder manuale separato ormai obsoleto e l'importazione PDF. Conservare import CSV/Excel, generatore MyCoatch ed esportazione/stampa PDF. Rimuovere il pannello «Correggi il riconoscimento dell'esercizio» da ogni card.

## Nuovo comportamento
- Il PDF non è accettato dal selettore né dal gestore di importazione. Eliminati parser, mapper, script PDF.js e relative voci della cache.
- Eliminata la cartella del vecchio builder. Non modifica i mesocicli già importati.
- CSV letto come testo senza SheetJS; Excel usa SheetJS 0.20.3 dal CDN ufficiale. Versione verificata nella documentazione ufficiale: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ . La risorsa Excel resta esterna e richiede rete, come prima; non si dichiara importazione Excel offline.
- Nell'anteprima i nomi riconosciuti e le associazioni personali salvate non richiedono domande. Per gli altri è richiesta una scelta: variante esatta dal catalogo oppure esercizio personalizzato. La ricerca propone fino a otto risultati, senza conferme automatiche per somiglianza.
- La scelta viene condivisa fra occorrenze con lo stesso nome, e ricordata nei successivi import. Il nome originale e le prestazioni restano conservati. Gli esercizi personalizzati mantengono un'identità propria.
- Scelte in bozza fino alla conferma finale: la persistenza avviene sul candidato attraverso la transazione esistente. Annullare l'anteprima non modifica il diario né il registro di associazioni. Nessuna migrazione dei dati.
- Note d'uso, selettore file, testo dei menu, CSS, versione e cache PWA aggiornati.

## Ambito
Questa modifica riguarda i tre punti concordati sull'importazione. Gli altri rilievi dell'audit generale (bozze delle serie, recuperi, fallback dello storico, aderenza e report giornaliero) richiedono interventi separati e non sono dichiarati risolti qui.

## Validazione
- 618 test Node superati.
- 125 test browser isolati superati, inclusi importazione, annullamento, nomi ripetuti e viewport da 320 px.
- Prova aggiuntiva con SheetJS 0.20.3 reale: generazione di file .xlsx e .xls, lettura attraverso il gestore della webapp, anteprima e conferma; modello Excel scaricabile verificato.
- Test effettuati con dati sintetici e richieste Supabase bloccate. Nessun accesso al diario autenticato dell'utente.

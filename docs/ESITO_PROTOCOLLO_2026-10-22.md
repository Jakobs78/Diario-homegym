# Aggiornamenti MyCoatch e HomeGym Diary — 22 ottobre 2026

Sono stati implementati gli interventi software del protocollo, incluso il passaggio automatico tra esercizi. Le verifiche esterne di MC-22 restano aperte; nessuna pubblicazione o modifica del diario reale è stata eseguita.

## Cosa cambia

- **Continuità fra allenamenti:** ultima esecuzione consultabile anche in un altro giorno della settimana; carico originario, prestazione e proposta di oggi distinti. Il caso 70 → 79 kg viene gestito senza imporre un aumento e tenendo conto dei recuperi differenti.
- **Progressione:** percorsi separati per ruoli di forza e volume, stime entro il limite prudenziale delle 12 ripetizioni, calcoli uniformi dei carichi realmente componibili, obiettivi di ripetizioni per singola serie e spiegazioni della riprogrammazione.
- **Interfaccia:** note e storico seguono l’esercizio attivo; l’ultima conferma valida apre il successivo senza interrompere il recupero. I gruppi completano il proprio percorso. Restano disponibili riapertura manuale, navigazione da tastiera, colori RPE più coerenti e movimento ridotto.
- **Dati:** salvataggi delle operazioni strutturali attesi e verificati; tentativi falliti non annunciano successo o avanzano la selezione. Date di esecuzione e modifica separate; warm-up esclusi coerentemente; corpo libero a zero kg conservato nelle statistiche.
- **Storico e report:** identificatori dei mesocicli non riciclati, nomi personali preservati, archivio recuperabile ed esclusione dal coaching. Tutti gli esercizi sono consultabili nei report, con ragioni dei confronti assenti e copertura muscolare dichiarata.
- **Personalizzazione:** profilo precompilato e modificabile, anteprime invalidate dopo cambiamenti del diario, limitazioni da rivalutare, esclusioni estese al catalogo, pesi disponibili dei manubri/macchine, attrezzatura di base modificabile e bilanciere registrato nelle nuove serie.
- **Importazione e aggiornamenti:** anteprima modificabile per schede, validazione approfondita dei backup, associazioni personali al catalogo persistenti e reversibili, versione visibile e aggiornamento PWA differito.

## Verifiche

- 522 test del motore superati.
- 106 test browser della suite completa superati, più esecuzioni mirate da 8 e 7 casi superate dopo le ultime rifiniture.
- PDF reale di cinque pagine con dodici esercizi sintetici, renderizzato e verificato visivamente.
- Lint delle nuove componenti senza errori; la verifica globale conserva 18 segnalazioni già presenti nel ramo base.

## Da verificare nell’ambiente reale

Permessi del database tra account reali, abbonamenti e scadenza prova, conflitti cloud reali, audio e sospensione su telefoni fisici. Non è stata modificata la produzione per simulare questi casi. La CI remota dipende anche dai limiti dell’account.

Il protocollo dettagliato resta il riferimento per i singoli MC-01–MC-25. Le formule e le soglie del coach sono regole prudenti e spiegabili, non garanzie individuali o apprendimento automatico.

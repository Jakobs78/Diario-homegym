# MyCoatch 1.3.2 — giri, riepilogo e progressione

Versione app `1.3.2-20261102`, protocollo `1.8`, cache PWA `v84`.

- Superserie/triset/jumpset: quando la conferma completa un giro intermedio, avviso «Si riparte col giro x» per 3 secondi, poi scorrimento al primo membro ancora da eseguire. Recupero conteggiato subito, timer sempre in basso sopra all’avviso. Nessun annuncio di giri inesistenti; annullamento dopo cambio seduta, consultazione di altro giro o riapertura di una serie.
- Riepilogo: area completa con sfondo azzurro tenue, intestazione verde, schede interne separate e avvisi ambra; temi chiaro e scuro. Apertura e scorrimento di fine seduta preservati.
- Consigli: peso, reps, range, RPE e istruzioni per verificare il nuovo carico; gli intervalli operativi dei kg restano nel calcolo ma scompaiono dalle celle.
- Progressione reps: se restano poche ripetizioni, obiettivo di chiudere tutte le serie al limite alto entro l’RPE. Per distanze maggiori resta un progresso graduale. La soglia applicativa richiede al massimo due reps mancanti per serie e un totale non superiore al numero di serie; non è una soglia fisiologica validata.
- Alte reps: priorità a incrementi dichiarati/inventario, altrimenti incremento indicativo pratico di almeno 1 kg. Da 4 a 5 kg è una proposta provvisoria da verificare. Microincrementi esplicitamente dichiarati restano supportati. Incrementi contenuti mantengono un target vicino al limite alto, senza ritorno automatico al minimo. Salti oltre il 30% richiedono revisione anziché generare un microcarico inesistente; soglia prudenziale applicativa.
- Recupero: normalizzazione di secondi, minuti e formato m:ss. 150/180 s non bloccano la progressione; non si applica una tolleranza universale di 30 s. Il criterio di vicinanza richiede entrambi i recuperi almeno a 150 s, distanza non oltre 30 s e non oltre il 20%. Recupero più lungo non costituisce da solo un veto; più breve o non noto richiede verifica. Ruolo della serie, reps/RPE e tecnica mantengono controlli distinti. La preferenza per recuperi simili non scavalca una seduta più recente e difficile.

## Verifica e dimensioni

665 test Node superati. Browser: nuova copertura temporizzata per superserie e triset, timer, ultimo giro, riapertura e cambio seduta; regressioni su storico, progressione, report, archivi e sincronizzazione simulate senza accesso al database reale. Controllo visivo dei due temi.

Scenario sintetico riproducibile: otto mesocicli, sei settimane ciascuno, un esercizio a tre serie per seduta. Diario precedente 192.768 byte; nuovo 195.680 byte (+1,51%). Venti ricalcoli per ciascun mesociclo: nessuna variazione aggiuntiva di byte o eventi. I consigli estesi e lo stato del popup sono prodotti dalla UI, senza salvarne copie nel diario. Archivio tecnico separato e ricevute di invio invariati; nessuna modifica SQL, auth o schema.

# Ripresa dell'allenamento indipendente dalla navigazione

Il controllo iniziale mostrava che anno, mesociclo, settimana e giorno visibili
erano anche l'unico riferimento di navigazione. Consultare lo storico non
conservava un collegamento indipendente alla scheda usata per allenarsi.

## Comportamento

- Il pulsante persistente nella testata mostra `Riprendi D – settimana 3` quando
  la seduta è iniziata ma incompleta, oppure `Inizia A – settimana 4` per la prima
  seduta ancora da iniziare. Il titolo aggiunge nome della scheda e della seduta.
- La destinazione non dipende dall'anno o dal mesociclo consultato. Un clic
  ripristina tutti i selettori e torna dalla vista analisi/manuale all'allenamento.
- All'interno della scheda attiva hanno priorità le sedute iniziate e irrisolte,
  quindi la prima irrisolta della sequenza. Con più sedute iniziate vale l'ordine
  di programma. Nessun avanzamento al cambio di data o al lunedì.
- Le serie valide confermate e le esclusioni esplicite determinano il completamento.
  Flag `completed` obsoleti e valori precompilati non bastano. Modifiche manuali,
  conferme, avvio del timer o pausa identificano una seduta iniziata.
- Il pulsante naviga senza avviare automaticamente il timer né rimuovere la pausa.
  Serie, note e tempi già accumulati rimangono intatti. I giorni senza lavoro
  prescritto e le schede chiuse/bloccate non vengono proposti per allenarsi.

## Programma attivo e compatibilità

`activeTrainingPlan.mesocycleId` è un piccolo riferimento nel diario esistente.
Si conserva con backup e sincronizzazione senza nuove tabelle o politiche cloud.
Importare una scheda, iniziare una seduta, riprenderne il timer o confermare una
serie seleziona esplicitamente quella scheda per allenarsi. La semplice
consultazione dello storico non lo fa.

Per una scheda aperta diversa è disponibile `Usa questa scheda per allenarti`.
L'operazione assegna un ID stabile alle schede legacy che ne sono prive e passa
attraverso la transazione locale già utilizzata dall'app. L'ID permette di ritrovare
la scheda anche dopo lo spostamento degli indici nell'anno.

Nei vecchi diari senza riferimento esplicito si preferisce una scheda aperta
con una seduta realmente iniziata e incompleta, altrimenti la scheda aperta più
recente. Quando la scheda selezionata è completata o chiusa, il pulsante non
propone automaticamente vecchi allenamenti incompleti. Se la scheda è stata
archiviata/rimossa, la destinazione viene ricalcolata fra quelle disponibili.

## Ripresa in un altro giorno

Il vecchio rendering azzerava `accumulatedSeconds` per un timer in corso dal
giorno precedente. Ora un timer rimasto in corso viene messo in pausa, conservando
il tempo già misurato, la data e le serie. La notte incustodita non viene aggiunta
alla durata. Le sedute già in pausa restano tali.

## Ambito e verifiche

Valido per schede brevi e percorsi lunghi. Nessuna integrazione del file guida:
rimangono i consigli live di MyCoatch e le note allenatore esistenti.

Test unitari: priorità della seduta iniziata, precompilazione, serie invalide,
esclusioni, puntatore stabile, schede legacy, completamento e pausa fra date diverse.
Test browser isolati: ritorno dallo storico di un altro anno e dall'analisi,
pausa e dati conservati, riapertura dell'app, etichetta Inizia/Riprendi,
avanzamento alla seduta successiva e scelta esplicita della scheda. Controllo
visivo e pulsante visibile durante lo scorrimento su viewport mobile da 320px.

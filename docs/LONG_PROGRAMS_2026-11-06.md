# MyCoatch: percorsi in settimane e scambio AI

## Controllo delle funzioni esistenti

La base esaminata è main, commit 63af5e385ea92ef54eb3fd1ac3c99d233cc0e41c.
Sono già presenti profilo e preferenze versionati, inventario di manubri e dischi,
vincoli di attrezzatura e cavo, stima e calibrazione della durata, raggruppamenti,
progressione da serie confermate, risposta agli stalli, sedute saltate/parziali,
report del mesociclo, backup e sincronizzazione con confronto della revisione.
Queste funzionalità vengono riutilizzate. Il generatore precedente produceva un
solo mesociclo da 1–12 settimane, con una roadmap condizionale di tre blocchi.

## Comportamento aggiunto

- Scelta indipendente di durata del mesociclo (1–12 settimane) e percorso
  (24, 26, 48, 52 settimane, oppure solo mesociclo).
- Numerazione globale delle settimane e numerazione locale nel mesociclo.
  L'ultimo blocco può essere più breve: 26 settimane con blocchi di 6 = 6+6+6+6+2.
- Settimane come giri di sedute, senza conversione in date o avanzamento al lunedì.
- Tutte le sedute previste sono consultabili; i blocchi successivi restano
  proposte condizionali. Il generatore conserva obiettivi e preferenze, senza
  inventare una rotazione annuale dei muscoli o carichi futuri acquisiti.
- Riepilogo del percorso e completamento per blocco; pulsante per la prima
  seduta irrisolta. I flag completed da soli non bastano: servono serie valide
  confermate o esclusioni esplicite; le serie saltate non diventano lavoro eseguito.
- Il protocollo dei programmi lunghi aggiorna i consigli della prossima seduta,
  evitando di duplicare gli stessi consigli in tutte le settimane future.
- CSV tradizionale invariato per il mesociclo singolo. Il percorso aggiunge
  ProgrammaSettimane e MesocicloSettimane: importazione con controllo delle durate
  concordanti e della presenza di tutte le settimane. Blocco resta l'ordine
  dell'esercizio e non viene reinterpretato come mesociclo.
- Nell'analisi, esportazione manuale di un unico Markdown con prompt universale
  e JSON: solo programma oppure programma e risultati. Le prescrizioni ripetute
  sono raccolte in un dizionario; i risultati restano per seduta. Funziona anche
  con schede importate da altri coach. Include il contesto salvato alla creazione
  quando disponibile, non sostituisce il contesto storico con il profilo attuale.
  Esclude account, note libere, date e ripetizioni archiviate. Non è un backup.

## Dimensioni e compatibilità cloud

La sincronizzazione mantiene snapshot, controllo della revisione e hash del
diario logico. Non cambia tabelle, autorizzazioni o criteri di conflitto.
Per diari contenenti un percorso lungo, il payload trasferito può essere un
involucro versionato homegym-cloud-gzip, gzip-base64. La lettura lo ricostruisce
prima di confronti, hash o uso nell'app. Il vecchio JSON resta leggibile.
Backup e stato locale conservano il formato esteso normale. Compressione solo
quando riduce i byte e il browser la supporta; errori o dati corrotti non sono
trasformati in un diario vuoto. La decompressione è limitata a 64 MiB.

Campione sintetico: 26 settimane, 4 sedute, blocchi di 6, 60 minuti,
scarico a calendario disattivato: circa 1.023.082 byte estesi e 48.728 byte
trasferiti. La dimensione cambia con storico e risultati; non è una misura della
latenza reale di Supabase. I dettagli diagnostici di generazione vengono omessi
dal nuovo programma importato, mentre prescrizioni e risultati rimangono.

La scrittura resta uno snapshot compresso, non una sincronizzazione per singola
riga. Una futura sincronizzazione differenziale richiede un progetto distinto
di migrazione e gestione dei conflitti.

Prima della pubblicazione aggiornare i dispositivi usati con lo stesso account:
le versioni precedenti dell'app non sanno leggere l'involucro compresso. Un rollback
deve mantenere il decoder oppure ripristinare un payload esteso con la normale
gestione delle revisioni. La modifica è preparata per revisione, non distribuita.

## Verifiche

- Suite Node completa e nuovi casi per programmi da 26/52 settimane, assenza di
  risultati inventati, calendario indipendente, preservazione dei risultati,
  prompt universale, round trip e riduzione del payload.
- Browser con dati sintetici e accesso alla produzione bloccato: importazione,
  round trip CSV, rifiuto dei metadati discordanti senza modifica del diario,
  ripresa della quarta seduta, download AI e ricaricamento persistente.
- Sincronizzazione simulata: perdita della risposta dopo scrittura compressa,
  recupero senza duplicare la scrittura, conflitti e test esistenti di progressione.

Il percorso lungo non garantisce un adattamento strutturale autonomo di tutti i
blocchi: le revisioni di esercizi/volume rimangono proposte da valutare. La scheda
personale dell'utente non viene inserita come modello obbligatorio del generatore.

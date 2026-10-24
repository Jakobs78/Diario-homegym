# Generazione dei mesocicli — 24 ottobre 2026

## Comportamento del rilascio

- Nuove proposte: da 1 a 12 settimane e da 1 a 6 sedute settimanali, con convalida nel modulo e nell'engine. Sono limiti di prodotto, non durate o frequenze ottimali universali.
- Un solo mesociclo dettagliato per proposta. La roadmap esistente rimane condizionale: non vengono caricati dodici mesi di allenamenti senza risultati futuri.
- Tutte le settimane e le giornate della proposta attraversano anteprima, CSV, importazione, archivio consultabile e report. Il profilo conserva la durata e le macchine selezionate.
- I modelli 3/4 giorni rimangono disponibili; 1/2 giorni usano Full Body essenziali, 5/6 giorni distribuiscono richiami oltre la base Upper/Lower. La scelta esplicita Upper/Lower o Full Body è disponibile su quattro giorni.
- Ogni giornata viene verificata dallo stimatore esistente, compresi riscaldamento, preparazione, recuperi e lati. Più giorni non applicano un incremento automatico delle serie per esercizio.
- La calibrazione iniziale non introduce uno scarico implicito alla quarta settimana di un blocco più lungo. La scelta deload esistente rimane separata e l'ultima settimana si riferisce alla durata effettiva.

## Attrezzatura e catalogo

Il catalogo passa da 53 a 66 voci mantenendo gli ID precedenti. Le nuove alternative sono chest press, shoulder press, hack squat, leg extension, leg curl seduto, rematore supportato a macchina, pec deck, reverse pec deck, calf in piedi/seduto a macchina, crunch a macchina, panca piana con manubri e RDL con manubri.

Ogni macchina richiede la propria disponibilità dichiarata; il flag generico `machine` non abilita altre macchine. Gli altri accessori e la topologia dei cavi mantengono i controlli esistenti. Il modulo richiede una conferma della dotazione selezionata. I preset iniziali e i default delle vecchie integrazioni API restano preset, non dati di inventario verificati.

Il puro corpo libero è escluso dalla generazione. Le identità rimangono nel catalogo per importazioni e storico; non vengono riscritte le vecchie schede. Anche le dip zavorrate rimangono escluse dalla generazione in questa versione: l'ammissione delle varianti zavorrate è ancora da definire, anziché dedurla dal precedente campo `bodyweight`.

Se manca una variante ammessa per uno slot opzionale, la lacuna rimane nel report. Non viene inventata una cavigliera né usato il walkout come ripiego. Le alzate laterali al cavo del catalogo sono considerate monolaterali per il calcolo dei tempi.

## Menu

- Un solo elenco degli esercizi da evitare, all'interno del relativo sottomenu; prima le aggiunte dinamiche finivano nel fieldset esterno.
- Le scelte delle varianti principali provengono dallo stesso elenco del selettore, senza una seconda lista divergente.
- Macchine elencate una sola volta, con identità propria.
- “Correggi il riconoscimento dell'esercizio” chiarisce il titolo del controllo esistente senza cambiarne gli effetti.
- La scelta facoltativa del sesso viene conservata nel profilo senza assegnare automaticamente obiettivi, split o carichi differenti.

## Compatibilità verificata e perimetro protetto

L'importatore già accettava fino a 52 settimane e 7 giorni. Il rilascio non amplia quei limiti: aggiunge un collaudo sintetico di importazione e navigazione fino a settimana 52/giorno 7 su smartphone, con tutte le 364 sedute nel modello del report.

Non vengono modificati gli algoritmi di `protocolLoad`, `trainingPlan`, precompilazione, gestione delle conferme, timer, salvataggio o sincronizzazione. Un test verifica che la riconciliazione delle proposte raggiunga settimana 8/giorno 6 e protegga risultati confermati e valori manuali.

L'anteprima non modifica il diario. Solo l'adozione esplicita importa un nuovo mesociclo separato.

## Limiti dichiarati

Questa consegna non completa ogni proposta del promemoria di ricerca: non introduce un pianificatore annuale autonomo, tempi diversi per ogni giorno, inventari separati per luogo o una nuova politica di conversione dei kg tra macchine. Non modifica la progressione dei carichi in tempo reale. La roadmap futura resta una previsione da rivalutare, non una garanzia scientifica o una serie di schede annuali già prescritte.

Il sito di produzione è raggiungibile, ma la sessione browser disponibile mostra il modulo di accesso. I test delle prestazioni e dei menu utilizzano dati sintetici isolati e bloccano le richieste a Supabase; non attestano un collaudo autenticato del diario del proprietario.

## Validazione locale

- 564 test Node superati, compresa la matrice settimane/giorni, il CSV fino a settimana 12/giorno 6 e la riconciliazione live oltre i vecchi limiti.
- 113 test browser eseguiti: 111 superati al primo passaggio; un controllo grafico e un controllo temporale audio richiedono distinzione dai problemi del generatore.
- La soglia grafica del primo esercizio su mobile misura 435,21875 px contro una soglia di 435 px sia nella versione modificata sia nella copia isolata del precedente main dc8d2da: nessuna regressione introdotta da questo rilascio. Il test non è stato allentato e il CSS del diario non è stato modificato.
- Il controllo audio riesce nella copia precedente; la prima esecuzione completa ha rilevato quattro beep brevi anziché cinque. La ripetizione mirata sulla versione modificata supera il test: cinque beep brevi e uno finale, senza modificare il timer.
- Tre nuovi collaudi browser mirati superati: 8 settimane/6 giorni con anteprima-download-importazione; CSV esterno di 52 settimane/7 giorni su mobile; assenza di duplicati nei menu dopo aperture ripetute.

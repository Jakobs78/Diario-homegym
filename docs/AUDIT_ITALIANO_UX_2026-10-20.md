# Revisione dell'italiano dell'interfaccia e dei consigli MyCoatch
20 ottobre 2026 · PR #87 · revisione delle stringhe utente, senza modificare le formule di allenamento

## Obiettivo e criteri

**Problema osservato.** Le schermate mostrano spesso termini tecnici privi di conseguenze pratiche. L'utente non capisce se una voce scarica un file, cambia il diario, suggerisce un intervento o applica una progressione. Nei CSV MyCoatch alcune frasi sono tanto generiche da non guidare il movimento.

**Criteri di qualità:**
1. Il titolo indica l'operazione; la descrizione dice cosa succede subito dopo e se modifica i dati.
2. Un consiglio segue «che cosa fare → come farlo → perché o quando farlo».
3. RPE, e1RM, tonnellaggio, crediti indiretti e stime di durata sono distinti da misure osservate di crescita, dolore e recupero.
4. Gli avvisi per il backup e la sincronizzazione restano chiari; nessun comando distruttivo deve sembrare un download innocuo.
5. La prima menzione di un termine tecnico ha una spiegazione italiana concreta. Il tag tecnico del parser può restare nel file CSV e nell'output diagnostico.
6. Le istruzioni devono essere leggibili su telefono: frasi complete, ma senza prolissità o ripetizioni inutili.

## Aree verificate e interventi

| Area verificata | Ambiguità iniziale | Modifica in PR #87 | Impatto sui dati |
|---|---|---|---|
| Menu ☰ e viste Analisi | «Macro» e «Micro & PR» non chiarivano l'effetto | Rinomina per andamento del programma, progressi del singolo esercizio e confronto fra due programmi | Nessuno |
| Strumenti: PDF / CSV | Esportazione scheda e storico apparivano simili | Indicazione esplicita di PDF da stampare, storico risultati, proposta CSV | Nessuno |
| Strumenti: backup/ripristino | «Ripristina» poteva sembrare fusione dati | Sostituzione non reversibile descritta prima dell'azione; backup JSON distinto da PDF/CSV | Nessuno |
| Strumenti: eliminazione | Distinzione tra singolo mesociclo, storico e account | Sottotitoli di rischio proporzionati a ciascuna operazione | Nessuno |
| Configuratore MyCoatch | Modalità scarico automatica poco comprensibile | Spiegazione quando Upper/Lower può introdurre settimana leggera e differenza «nessuno scarico» | Nessuno |
| Dotazione MyCoatch | Barra lunga lat machine confusa con sbarra per trazioni | Differenziate sbarra fissa, barra a cavo e impugnatura triangolare | Nessuno |
| Anteprima MyCoatch | «Applica» accanto a «Scarica CSV» | Distinzione esplicita fra solo download e import di un nuovo mesociclo | Nessuno |
| Report proposta | «Macrociclo», «volume frazionario», «copertura funzionale» | Spiegazione del significato, delle serie dirette/indirette e degli adattamenti al tempo | Nessuno |
| Note nel CSV | «Calibra kg in base a reps e RPE» | Sequenza pratica per scegliere peso, rispetto dell'RPE, registrazione reale | Nessuno |
| Esercizi CSV | «Solleva senza slanci» in diversi movimenti | Indicazioni mirate per posteriori spalle, leg curl, squat, panca, lat machine, ecc. | Nessuno |
| Tecniche CSV | «superset»/«triset» troppo sintetici | Spiegazione di cosa si alterna, quando recuperare e cosa registrare | Nessuno |
| Riscaldamento CSV | Warm-up senza scopo esplicito | Indicazione che non è volume allenante e che precede le serie lavorative | Nessuno |
| Coaching in seduta | Carico prossimo, RPE reale e stimato confondibili | Report distingue eseguito, obiettivo, stima e suggerimento non applicato | Nessuno |
| Revisione settimana/carichi | I pulsanti non spiegavano bene la modifica | Specifica che toccano solo target o pesi futuri e richiedono conferma | Nessuno |
| Riepilogo e PDF fine mesociclo | Crediti muscolari letti come serie o crescita | Descrizione del conteggio e limiti della comparazione | Nessuno |
| Manuale | Terminologia sparsa in molte sezioni | Glossario con esempi ed elenco delle conseguenze dei menu | Nessuno |

## Esempi «prima → dopo»

- **Prima:** «Micro Esercizio & PR». **Dopo:** «Progressi per esercizio e record»; una descrizione spiega che mostra risultati confermati.
- **Prima:** «Scarica Nuovo Mesociclo (.CSV) — MyCoatch». **Dopo:** «Progetta una nuova scheda con MyCoatch», con distinzione anteprima, download e import.
- **Prima:** «Carico: calibra kg in base a reps e RPE». **Dopo:** «Dopo il riscaldamento usa un peso con cui completi le ripetizioni rispettando l'RPE [...] Annota kg, ripetizioni e RPE reali».
- **Prima:** «Superset: recupera dopo la coppia». **Dopo:** specifica due esercizi senza pausa e recupero dopo entrambi.
- **Prima:** «Crediti indiretti». **Dopo:** specifica che sono una convenzione per ripartire serie già eseguite, non una seconda serie da svolgere né una misura della crescita.

## Compatibilità e test

La PR preserva attributi DOM `id`/`data-action`, token del parser CSV e 12 colonne della scheda. Non deve riscrivere serie confermate, cambiare carichi, RPE target o date. I test devono verificare l'import del CSV, il formato di esportazione, il report PDF, l'accessibilità dei menu e i flussi della webapp in browser isolato, oltre alla lettura delle nuove spiegazioni.

I commenti generati da MyCoatch rimangono **una prescrizione generale**: non garantiscono tecnica, assenza di dolore o adeguatezza dei carichi per una persona specifica. Le esecuzioni che richiedono attrezzatura non dichiarata devono ancora essere respinte dalle regole di selezione, non soltanto spiegate meglio in UI.

## Ulteriori punti da rivedere in seguito

- Mettere un piccolo glossario contestuale vicino a grafici complessi, senza aprire il manuale.
- Validare il linguaggio su utenti reali, con prove guidate da smartphone e lettura da parte di persone non esperte.
- Ampliare la copertura degli esercizi nuovi/aggiunti dall'utente e delle note provenienti da terzi senza riscrivere indicazioni cliniche non affidabili.
- Raccogliere feedback su istruzioni CSV troppo lunghe o poco visibili e migliorare la leggibilità del pannello note.
- Verificare che la terminologia esportata sia ripresa correttamente nei PDF generati e in eventuali importazioni da PDF di terzi.

**Deploy:** il limite Vercel `build-rate-limit` va gestito separatamente: il merge GitHub non prova che la UI pubblica abbia ricevuto queste modifiche.

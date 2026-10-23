# Protocollo adattivo MyCoatch 1.4

Durante il mesociclo attivo MyCoatch aggiorna proposte di carico, reps e consigli. Esercizi, numero di serie, giorni, settimane, ordine, recuperi, gruppi e target RPE originali restano invariati. Le modifiche alla struttura appartengono al feedback e alla generazione del ciclo successivo.

## Flusso operativo

- `trainingHistory.js` ricerca soltanto esecuzioni confermate anteriori alla destinazione, attraverso giorni, mesocicli e anni. Un esercizio completato vale anche in una giornata incompleta. Riscaldamenti, bozze e varianti differenti sono esclusi.
- `setPrescription.js` mantiene indipendenti target di kg, reps, RPE e ruolo della singola serie. Top set e back-off sono valutati separatamente.
- `protocolLoad.js` sceglie fino a tre esposizioni pertinenti, prepara un valore concreto, considera le serie confermate di oggi e distingue capacità storica e fatica attuale.
- `trainingPlan.js` riconcilia il mesociclo. `coachSetProposals` e `coachAdaptiveNotes` sono proposte separate da `sets`, `loggedSets`, `notes` e `userNotes`. Il registro `coachAdjustments` conserva destinazioni, valori precedenti e successivi e serie di origine.
- Il rendering prepara le proposte iniziali; il normale salvataggio le ricalcola e le include nella stessa transazione locale e coda cloud dei risultati. Checkbox e modifiche successive ricalcolano le dipendenze. Nessuna proposta si considera una prestazione.
- I campi già scritti dall'atleta e le righe confermate prevalgono. Mesocicli bloccati o conclusi restano immutati. Il motore non applica aumenti trasferiti alle giornate già iniziate.
- Una prestazione aggiorna soltanto la prossima esposizione pertinente. La riconciliazione è idempotente, anche dopo serializzazione, riapertura e sincronizzazione.

## Regole e parametri numerici adottati

Questi parametri sono scelte software prudenti e verificabili, non soglie validate universalmente dalla ricerca.

1. Range con limite alto fino a 12: tutte le serie del blocco devono raggiungere almeno il limite alto con RPE non superiore al proprio target. Il nuovo peso riparte dal limite basso delle reps. In caso contrario si mantiene il riferimento e, se consentito, si propone una rep in più in una sola serie.
2. Range con limite alto oltre 12: mantenimento dei kg pertinenti, anche con RPE diverso. Nessuna stima del massimale da quelle prescrizioni e nessun aumento automatico. Restano possibili correzioni prudenti per difficoltà durante la seduta e modifiche dell'atleta.
3. La stima è Epley con RIR: `kg × (1 + (reps + 10 − RPE) / 30)`, soltanto per serie utilizzabili fino a 12 reps con RPE 6–10. Non è un massimale misurato. Se l'RPE manca o è inadatto, si mantiene un riferimento diretto.
4. Il riferimento stabile richiede almeno due stime confrontabili fra le ultime tre, con dispersione non superiore al 10%; usa la mediana, non la massima. Le serie affaticate di oggi modificano la proposta attuale senza abbassare quel riferimento.
5. Negli schemi di forza a reps fisse il range operativo è inizialmente ±2,5% attorno al peso proposto. Non è un intervallo di confidenza. La cella contiene comunque un valore iniziale concreto.
6. Uno scarto isolato di 0,5 RPE non genera variazioni del peso. Uno scarto chiaramente maggiore può ridurre la proposta della serie successiva; la riduzione per singola correzione è limitata al 10%. Un margine di almeno 1 RPE può consentire più reps entro il range o un piccolo aumento.
7. Per la progressione, usare l'incremento configurato quando presente e verificarne sostenibilità e inventario. Senza dati, incremento teorico iniziale del 2,5% per bilanciere/macchine e 5% per manubri, con limiti del 5% e 10% rispettivamente. Disponibilità sconosciuta resta dichiarata sconosciuta; non si inventa il possesso di microcarichi.
8. Se l'inventario conosciuto non permette il peso teorico, la proposta non sparisce: viene indicata come teorica non componibile. Le funzioni del calcolatore dischi continuano a distinguere i carichi realmente disponibili.
9. Dolore segnalato sospende la proposta di carico. I check-in prudenziali possono impedire aumenti. Tre esposizioni con andamento simile o in calo producono osservazioni, senza diagnosticare stalli o cambiare esercizi e volume.

## Compatibilità

Le API precedenti di precompilazione e revisione restano disponibili ai consumatori legacy e alla generazione di fine ciclo. Nel mesociclo attivo le card usano sempre le proposte persistenti del protocollo; i vecchi pulsanti di applicazione non costituiscono un secondo percorso concorrente. La revisione settimanale che cambia RPE non viene proposta nel nuovo flusso attivo.

CSV esistenti continuano a funzionare. I target per serie possono essere indicati tramite il tag `[OBIETTIVO REPS PER SERIE] 3/6-8/6-8` oppure le colonne opzionali `RepsPerSerie`, `RPEPerSerie`, `KgMinPerSerie`, `KgMaxPerSerie`, con valori separati da `/`.

## Verifica

Test di regressione preesistenti, casi dedicati a storico, RPE, range, top/back-off, modifiche manuali, dati confermati, ricalcolo e idempotenza. Test browser isolati verificano persistenza offline, riapertura e correzione della sorgente senza accedere a Supabase reale. I moduli nuovi fanno parte della cache PWA.

# MyCoatch: continuità e decisioni verificabili

Questo aggiornamento integra i rami delle PR #87 e #90, mantenendo i testi italiani e i target delle ripetizioni per singola serie. Non richiede migrazioni distruttive del diario.

## Memoria tra mesocicli

Il pulsante «Salva profilo nel diario» salva anche giorni, minuti, obiettivo, struttura, scarico, varianti e accessori selezionati. Applicare una proposta conferma gli stessi parametri. Alla riapertura tutti i valori disponibili tornano nei campi modificabili; i minuti personalizzati restano personalizzati. Aprire, modificare o annullare un'anteprima non salva di nascosto. Il solo download CSV non salva le preferenze.

Il diario conserva le revisioni, mentre ogni programma applicato conserva uno snapshot dei parametri e dell'attrezzatura usati. Il check-in giornaliero non viene riutilizzato come risposta attuale. Le opzioni automatiche vengono trasmesse esplicitamente: non ereditano più la scelta della proposta precedente.

## Carichi e progressione

Per prescrizioni fino a 12 ripetizioni si può invertire la formula Epley corretta con il RIR: `kg = e1RM / (1 + (ripetizioni + 10 − RPE) / 30)`. Non è una misura del massimale reale. La nuova prescrizione usa il limite basso del range e il suo RPE.

La base è il riferimento conservativo delle ultime tre esposizioni affidabili dello stesso esercizio: serie complete, omogenee, confermate, senza tecniche speciali e con RPE 6–9,5. Per ogni esposizione si prende la stima minima; tra esposizioni si prende la mediana inferiore. Il filtro già esistente dello storico recente resta attivo. Non si convertono serie oltre 12 ripetizioni, RPE mancanti o molto bassi in riferimenti per questa prescrizione.

Con inventario dichiarato, la ricerca considera combinazioni finite dei dischi compatibili con il bilanciere assegnato. Un bilanciere rimosso dall'elenco posseduto richiede una nuova scelta. Senza inventario, gli incrementi rimangono indicativi e vengono dichiarati tali.

La proposta per la prossima seduta aumenta prima una ripetizione in una sola serie entro il range, mantenendo il peso. Al limite alto può proporre un incremento; se il salto minimo richiede di ripartire dal limite basso, lo può proporre soltanto entro 12 ripetizioni, con una stima prudente compatibile e un limite sul salto. Se non esiste un'alternativa, mantiene il lavoro consolidato e spiega la necessità di verificare l'attrezzatura o rivedere esplicitamente il range. Non allunga il range automaticamente. La revisione che aggiorna soltanto i kg nelle sedute future non applica i salti che richiedono anche nuovi target di ripetizioni: restano proposte da rivalutare insieme alle ripetizioni.

Le proposte LIVE usano la stessa verifica dell'attrezzatura. Un suggerimento divenuto obsoleto dopo un cambiamento del check-in o dell'inventario non viene applicato da un vecchio pulsante. RPE 5 e 5,5 sono registrabili senza trasformarli in e1RM attendibili.

## Programma e durata

L'applicazione dall'anteprima conserva durata, classificazione muscolare, priorità, scarico e prescrizioni per serie. Il passaggio attraverso il CSV viene validato prima di trasferire i metadati. Le prestazioni rimangono vuote e non confermate.

Nella Full Body a quattro giorni un controllo finale cerca di ripristinare spinte e tirate orizzontali/verticali, squat, hip hinge e flessione del ginocchio prima di conservare lavoro ripetuto. Usa esercizi già compatibili, recuperi reali e lo stesso ottimizzatore temporale. Mostra le sostituzioni nell'anteprima. La copertura funzionale non implica volume ottimale per ogni muscolo; limiti di tempo, esclusioni e attrezzatura possono ancora imporre rinunce esplicite.

Il tempo residuo LIVE conta entrambi i lati degli esercizi unilaterali. Il CSV conserva una breve indicazione di durata; l'anteprima distingue la stima dal cronometro effettivo.

## Continuità e recupero

Gli esercizi che funzionano restano. Una variante può essere proposta dopo segnali persistenti di stallo su blocchi confrontabili, senza segnali prevalenti di fatica o progressione già disponibile. Le preferenze esplicite dell'atleta restano prioritarie. Il carico di una variante diversa richiede una propria evidenza o calibrazione.

La revisione settimanale è visibile anche quando i dati sono insufficienti, la settimana è iniziata o non serve un cambiamento. Due giornate affidabili sullo stesso distretto possono sostenere una proposta anche se un'altra seduta non è completa. Difficoltà diffuse richiedono una valutazione del recupero; non autorizzano una riduzione generale automatica.

## Limiti operativi

Le regole sono euristiche trasparenti: non identificano automaticamente cause fisiologiche, non misurano il recupero e non garantiscono un RPE futuro. La qualità dei suggerimenti dipende dai dati registrati. Il cloud usa la persistenza già prevista dalla webapp; un account con salvataggio cloud bloccato non viene sbloccato da questo aggiornamento. Pubblicazione e merge restano separati dalla preparazione della PR.

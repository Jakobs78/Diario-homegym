# Protocollo degli aggiornamenti di MyCoatch e della webapp

**Versione:** 1.3 — 22 ottobre 2026 (aggiornamento del documento originale)  
**Stato:** interventi software implementati e verificati localmente. MC-22 resta aperto per le verifiche sul backend remoto e sui dispositivi fisici. Un solo commit conclusivo; nessuna pubblicazione automatica.

Questo documento raccoglie i 22 punti originari dell’audit, le precisazioni concordate e tre ulteriori requisiti (MC-23, MC-24 e MC-25). Le migliorie qui concordate sono registrate per la futura implementazione; L’utente ha ora autorizzato l’implementazione di tutti i punti, con un solo commit finale. Le verifiche reali restano distinte dai controlli locali.

**Base esaminata:** revisione `e6c4827ba093820222aa8bc05e3d860f9f59bf6c` del repository Diario-homegym. Nell’audit sono passati 505 test del motore e 101 test browser locali; le prove esplorative hanno rilevato casi non coperti. Questi risultati non certificano il backend remoto o tutti i dispositivi reali.

**Fonte:** [Panoramica dell’audit del 22 ottobre](AUDIT_MYCOATCH_2026-10-22.md), contenente dettagli, esempi e riferimenti al codice. La revisione 1.1 integra anche la prova sintetica sullo squat ripetuto nella stessa settimana e le due schermate fornite dall’utente il 22 ottobre: prestazione a 79 kg e seduta successiva ancora proposta a 70 kg. Le schermate documentano i valori visibili, non consentono di certificare l’intero stato del diario.

## Priorità e lettura

- **P1:** correttezza dei dati e delle decisioni del coach, da affrontare nel prossimo intervento.
- **P2:** miglioramento importante; alcuni punti richiedono una scelta di prodotto prima dell’implementazione.
- **V:** verifica ancora necessaria nell’ambiente reale; non indica un difetto già dimostrato.
- **Riprodotto:** riscontro con dati sintetici. **Codice:** percorso individuato nel sorgente. **Proposta:** comportamento da concordare.

Le caselle indicano gli interventi software completati e verificati localmente. Le verifiche esterne ancora necessarie sono raccolte in MC-22: una casella chiusa non certifica hardware, backend remoto o affidabilità fisiologica delle stime.

## Registro degli aggiornamenti

### MC-01 — Salvataggi affidabili

- [x] **Implementato / verifica locale — P1.** Riscontro: codice.
- **Aggiornamento:** Confermare il successo soltanto dopo il salvataggio effettivo; distinguere dati salvati sul dispositivo, sincronizzazione in coda e dati sul cloud. Rendere ripetibili i tentativi falliti anche per profilo, importazioni e revisioni.
- **Criterio di chiusura:** Simulando un errore di memoria non compare un falso successo; i dati restano recuperabili e il nuovo tentativo salva davvero.

### MC-02 — Date delle prestazioni e delle modifiche

- [x] **Implementato / verifica locale — P1.** Riscontro: codice.
- **Aggiornamento:** Separare data di esecuzione, registrazione e modifica. Correggere una vecchia serie non deve renderla una prestazione recente. Uniformare il giorno locale.
- **Criterio di chiusura:** Una correzione storica non entra nella finestra delle prestazioni recenti; le registrazioni intorno a mezzanotte rispettano Europe/Rome.

### MC-03 — Regole comuni per serie valide e completamento

- [x] **Implementato / verifica locale — P1.** Riscontro: riprodotto.
- **Aggiornamento:** Condividere tra diario, timer, report e coach la definizione di serie di lavoro, riscaldamento e completamento. Separare validità della registrazione e idoneità al calcolo del massimale.
- **Criterio di chiusura:** Tre righe di cui una di riscaldamento producono conteggi coerenti; RPE 5 resta registrabile; carichi mancanti non danno completamento pieno, salvo esercizi a corpo libero validi.
- **Regola warm-up concordata:** Se l’intero esercizio è classificato come riscaldamento, tutte le sue serie sono escluse da progressione, stime del massimale, record, confronti allenanti e volume allenante. Se è marcata solo una serie con W, si esclude soltanto quella serie. I dati restano consultabili come riscaldamento. La nota testuale «[WARM-UP] Serie leggere di avvicinamento» non classifica automaticamente tutto l’esercizio; lo stato deve essere esplicito e distinguibile dalla semplice presenza del pulsante W. Una riclassificazione deve aggiornare i risultati derivati e invalidare i suggerimenti che dipendevano dalle serie escluse.
- **Verifica aggiuntiva:** Escludere prima una singola serie e poi l’intero esercizio: nessun percorso del coach deve continuare a usarli come evidenza allenante, mentre le altre serie ammissibili restano utilizzabili.

### MC-04 — Progressione per ruolo e continuità tra sedute

- [x] **Implementato / verifica locale — P1.** Riscontro: riprodotto.
- **Aggiornamento:** Seguire separatamente le esposizioni di forza e volume dello stesso esercizio, conservando la possibilità di trasferire stime con cautela.
- **Criterio di chiusura:** Lo stesso esercizio a 4–6 e 8–12 ripetizioni progredisce in due percorsi distinti senza bloccare la valutazione dello stallo.
- **Integrazione concordata:** Cercare l’ultima prestazione reale anche in giorni diversi della stessa settimana, senza limitarsi allo stesso giorno delle settimane precedenti. Unificare la selezione dello storico usato da riepilogo, precompilazione e coach. Le prescrizioni identiche devono essere gestite esplicitamente, senza cadere tra due percorsi che si escludono reciprocamente. Per schemi diversi conservare la separazione per ruolo e le cautele sul trasferimento delle stime.
- **Verifica aggiuntiva:** Un primo squat con serie allenanti confermate deve comparire come riferimento nel secondo squat confrontabile della stessa settimana. Non devono essere usate sedute future, proposte non confermate o serie di riscaldamento; un dato presente ma non utilizzabile deve avere una ragione visibile.

### MC-05 — Coerenza fra consiglio e prescrizione

- [x] **Implementato / verifica locale — P1.** Riscontro: codice e prove.
- **Aggiornamento:** Generare spiegazione, carico, ripetizioni e RPE da una sola decisione strutturata per serie. Distinguere progressione nella scheda e riprogrammazione del mesociclo successivo.
- **Criterio di chiusura:** Il consiglio di aggiungere una ripetizione a una serie coincide con la prescrizione; eventuali cambiamenti di carico o intervallo sono espliciti e motivati in ogni vista.
- **Integrazione concordata:** Distinguere chiaramente consiglio per la prossima serie e proposta per la prossima seduta. Mostrare separatamente carico originario del piano, prestazione precedente e proposta aggiornata. Un carico già scritto nella scheda non deve impedire una rivalutazione motivata prima della seduta. Aggiornare il riferimento iniziale sulla base della prestazione reale non equivale a prescrivere un ulteriore aumento. Non sovrascrivere inserimenti manuali, serie confermate o prescrizioni particolari senza una scelta esplicita.
- **Caso di accettazione dalle foto:** Piano a 70 kg, 3×5–6 @7; esecuzione a 79 kg per 6/6/6 con RPE 6,5/6,5/7. La successiva esposizione deve mostrare questi dati e valutarli per il carico iniziale, senza riproporre silenziosamente 70 kg. Deve considerare anche il recupero diverso (180 contro 150 secondi), attrezzatura, eventuale scarico e condizioni attuali. Non è richiesto un incremento obbligatorio oltre 79 kg: mantenimento, incremento realizzabile o riduzione devono essere motivati. Un aumento non deve essere dedotto soltanto dalle prime due serie se la terza raggiunge il target RPE.

### MC-06 — Calcolo unico dei carichi realizzabili

- [x] **Implementato / verifica locale — P1.** Riscontro: riprodotto.
- **Aggiornamento:** Usare lo stesso risolutore di inventario in generazione, suggerimenti e adattamento durante la seduta. Considerare peso del bilanciere, diametri e quantità dei dischi.
- **Criterio di chiusura:** Il caso con bilanciere da 9 kg e combinazione disponibile da 51 kg viene riconosciuto da tutti i percorsi; se non esiste un carico adatto si spiega la scelta di arrotondare o progredire nelle ripetizioni.

### MC-07 — Identificatori permanenti dei mesocicli

- [x] **Implementato / verifica locale — P1.** Riscontro: riprodotto.
- **Aggiornamento:** Separare identificatore stabile e numero visualizzato. Evitare collisioni dopo eliminazione e importazione; preservare i nomi personalizzati. Prevedere archiviazione o recupero.
- **Criterio di chiusura:** Eliminare e importare non crea identificatori duplicati né rinomina altri mesocicli; selettori e statistiche continuano a riferirsi al blocco corretto.

### MC-08 — Esercizi esterni e nomi personalizzati

- [x] **Implementato / verifica locale — P1.** Riscontro: codice.
- **Aggiornamento:** Conservare identità e nome originale degli esercizi importati. Consentire associazione confermata al catalogo, variante e attrezzatura, senza dedurre automaticamente dettagli ambigui.
- **Criterio di chiusura:** Un esercizio sconosciuto resta nel diario e nei report; una generica lat machine non viene confusa automaticamente con una presa specifica.

### MC-09 — Report completo e trasparente

- [x] **Implementato / verifica locale — P1.** Riscontro: codice.
- **Aggiornamento:** Rendere accessibili tutti gli esercizi oltre il limite iniziale di otto. Mostrare motivi dei confronti mancanti e quota di volume non classificata, anche nei documenti esportati.
- **Criterio di chiusura:** Un report con più di otto esercizi li rende tutti consultabili; nomi sconosciuti, date mancanti e dati insufficienti sono segnalati, senza sparire silenziosamente.

### MC-10 — Statistiche degli esercizi a corpo libero

- [x] **Implementato / verifica locale — P1.** Riscontro: riprodotto.
- **Aggiornamento:** Separare carico esterno, validità della serie, volume e stima del massimale. Non escludere dalle statistiche una serie valida solo perché registra zero kg.
- **Criterio di chiusura:** Un hamstring walkout a zero kg contribuisce a serie, ripetizioni e aderenza senza inventare peso corporeo o massimale.

### MC-11 — Dolore e limitazioni nella programmazione successiva

- [x] **Implementato / verifica locale — P1/P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Portare nel nuovo mesociclo i problemi rilevati, chiedendo se sono ancora attuali. Consentire esclusioni e alternative per ogni esercizio, senza trasformare una segnalazione in un divieto permanente.
- **Criterio di chiusura:** Un problema noto induce una verifica e una scelta compatibile; un problema risolto può essere rimosso. RPE e dolore non vengono trattati come equivalenti.

### MC-12 — Stime del massimale comprensibili e coerenti

- [x] **Implementato / verifica locale — P2.** Riscontro: riprodotto.
- **Aggiornamento:** Dichiarare formula, uso del RPE, campione e affidabilità delle stime. Mantenere il limite prudenziale delle 12 ripetizioni per il coaching, senza presentarlo come garanzia di precisione.
- **Criterio di chiusura:** Le differenze fra stime sono spiegabili; una stima non disponibile non compare come zero; non si confrontano formule diverse come fossero identiche.

### MC-13 — Qualità e provenienza del RPE

- [x] **Implementato / verifica locale — P2.** Riscontro: proposta.
- **Aggiornamento:** Distinguere RPE proposto, accettato e modificato. Consentire un valore non noto e valutare una conferma dedicata semplice, senza appesantire ogni registrazione.
- **Criterio di chiusura:** Il RPE mancante non viene inventato e la fiducia nella decisione riflette la provenienza del dato. La conferma dell’intera riga ha un significato chiaro.

### MC-14 — Inventario completo della home gym

- [x] **Implementato / verifica locale — P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Estendere la verifica a pesi e limiti reali dei manubri, configurazioni dei cavi, panca, rack e accessori. Rendere visibili le convenzioni di carico già previste.
- **Criterio di chiusura:** Non viene proposto come verificato un peso non posseduto; attrezzature incompatibili vengono escluse o calibrate; peso totale del bilanciere e peso del singolo manubrio sono chiari.

### MC-15 — Attrezzatura storica e preferenza del bilanciere

- [x] **Implementato / verifica locale — P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Conservare la preferenza per esercizio e registrare quale attrezzo è stato usato nella prestazione, insieme alla convenzione del peso.
- **Criterio di chiusura:** La scelta del bilanciere viene riproposta nello stesso esercizio; cambiarla non modifica retroattivamente i carichi o l’attrezzatura delle serie precedenti.

### MC-16 — Durata realistica, recuperi e logistica

- [x] **Implementato / verifica locale — P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Uniformare le stime di durata considerando ripetizioni, riscaldamento, entrambi i lati, recuperi e cambi di postazione. Distinguere tempo totale e tempo effettivamente registrato.
- **Criterio di chiusura:** L’obiettivo di 50–60 minuti tiene conto dell’allestimento reale e non si ottiene tagliando arbitrariamente i recuperi; i superset sono compatibili con le postazioni disponibili.

### MC-17 — Distribuzione muscolare e volume personalizzato

- [x] **Implementato / verifica locale — P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Applicare un controllo finale comune a tutte le divisioni, dopo eventuali riduzioni per tempo. Distinguere serie dirette e contributi indiretti e adattare gradualmente il volume alla risposta individuale.
- **Criterio di chiusura:** Carenze di copertura e compromessi sono dichiarati; i valori teorici di volume non vengono presentati come misurazioni personali o percentuali certe di crescita.

### MC-18 — Stallo, scarico e continuità degli esercizi

- [x] **Implementato / verifica locale — P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Centralizzare le regole di scarico e motivare eventuali differenze fra programmi. Prima di cambiare esercizio verificare aderenza, tecnica, recupero, carichi disponibili e stallo reale.
- **Criterio di chiusura:** Gli esercizi produttivi possono restare nel mesociclo successivo; lo scarico ha una motivazione e le variazioni non avvengono soltanto perché finisce il blocco.

### MC-19 — Memoria del profilo e validità delle anteprime

- [x] **Implementato / verifica locale — P2.** Riscontro: codice e proposta.
- **Aggiornamento:** Preservare precompilazione e modifica dei parametri personali. Segnalare anteprime diventate obsolete dopo cambiamenti rilevanti e calibrare separatamente gli esercizi senza storico.
- **Criterio di chiusura:** Annullare non salva modifiche; i campi del blocco successivo restano precompilati e modificabili; cambiamenti sostanziali richiedono aggiornamento dell’anteprima.

### MC-20 — Importazioni, backup e percorsi precedenti

- [x] **Implementato / verifica locale — P1/P2.** Riscontro: riprodotto e codice.
- **Aggiornamento:** Unificare validazione e anteprima delle importazioni; controllare semanticamente i backup prima di applicarli. Isolare o rimuovere i percorsi non più utilizzati.
- **Criterio di chiusura:** Un backup con serie non valide, incluso loggedSets:[null], viene rifiutato prima di alterare lo stato; un’esportazione e reimportazione completa conserva identità, date, target e dati eseguiti.

### MC-21 — Aggiornamenti PWA sicuri e versione visibile

- [x] **Implementato / verifica locale — P2.** Riscontro: osservazione e codice.
- **Aggiornamento:** Mostrare la versione in uso, offrire l’aggiornamento in un momento sicuro e proteggere sessioni e dati in coda. Dichiarare quali funzioni dipendono dalla rete.
- **Criterio di chiusura:** Un aggiornamento con registrazioni pendenti non perde dati; l’utente sa se sta usando una versione precedente; le funzioni offline hanno limiti espliciti.

### MC-22 — Verifiche reali di backend, dispositivi e pubblicazione

- [ ] **Parzialmente verificato — V/P2.** Riscontro: verifica aperta.
- **Aggiornamento:** Completare le prove di permessi tra account, prova scaduta, sincronizzazione, uso offline, dispositivi iOS/Android e PDF reali. Integrare i casi emersi nei controlli fra moduli.
- **Criterio di chiusura:** Account di test separati non accedono ai dati altrui; recupero e conflitti sono verificati sul servizio reale; comportamento in background e PDF sono controllati. Il blocco di fatturazione della CI è trattato separatamente dal codice.

### MC-23 — Impaginazione e animazioni funzionali

- [x] **Implementato / verifica locale — P2.** Riscontro: osservazione della vista mobile, schermate e migliorie concordate; non è stato realizzato un nuovo layout.
- **Aggiornamento:** Rendere subito riconoscibili esercizio attuale, target e proposta del coach. Compattare navigazione, timer e azioni occasionali; mantenere leggibile il nome dell’app. Ridurre lo spazio occupato dal check-in dopo la compilazione, senza nascondere segnalazioni importanti. Dare priorità a un consiglio principale, lasciando motivazioni e dettagli espandibili. Richiudere le note personali vuote e usare icone e colori coerenti, con meno emoji.
- **Effetti concordati:** Brevi transizioni di apertura dei dettagli, conferma visiva della serie, avanzamento fluido della barra e breve evidenziazione di una proposta cambiata. Evitare animazioni continue durante l’allenamento e rispettare la preferenza di movimento ridotto.
- **Criterio di chiusura:** Su telefono l’accesso all’esercizio non è ostacolato da pannelli secondari estesi; navigazione, tastiera e registrazione restano utilizzabili. Le animazioni non spostano i campi durante l’inserimento, non rallentano la conferma e possono ridursi senza perdere informazioni. Verificare anche vista desktop, contrasto, focus e leggibilità.

### MC-24 — Riepilogo precedente, proposta e colori del RPE

- [x] **Implementato / verifica locale — P2.** Riscontro: schermate e comportamento concordato. Dipendenze: MC-03, MC-04, MC-05 e MC-13.
- **Aggiornamento:** Vicino al target mostrare un riepilogo compatto «precedente → proposta di oggi», con data o seduta, carichi, ripetizioni per serie e RPE registrati. Indicare se il dato è confrontabile e rendere espandibile il dettaglio. Evidenziare la serie attiva e alleggerire visivamente quelle concluse. Non comunicare automaticamente come errore un RPE inferiore al target: nella schermata 6,5 contro 7 indica un margine da interpretare insieme alle altre serie, non una violazione da colorare indiscriminatamente in rosso.
- **Criterio di chiusura:** Nel caso dello squat sono visibili 79 kg, 6/6/6 e 6,5/6,5/7, insieme alla proposta e al motivo. Valori mancanti non vengono inventati; nessuna informazione dipende soltanto dal colore. RPE sotto target, sopra target e non valido sono distinguibili con testo coerente, senza confondere margine disponibile con aumento obbligatorio.

### MC-25 — Passaggio automatico e pannelli dell’esercizio attivo

- [x] **Implementato / verifica locale — P2.** Requisito concordato dopo le schermate.
- **Aggiornamento:** Gli esercizi non attivi hanno i dettagli richiusi. L’esercizio attivo apre note, storico e proposta per tutte le sue serie, senza richiuderli ai controlli o agli aggiornamenti. Alla conferma valida dell’ultima serie ancora da completare, chiudere i dettagli del precedente e aprire quelli del successivo con scorrimento. Il recupero continua senza azzeramento. L’utente può riaprire e correggere gli esercizi precedenti; le scelte manuali persistono fino al cambio di esercizio.
- **Gruppi e conclusione:** Nei superset e circuiti restano disponibili gli esercizi del gruppo attivo; non passare oltre finché il gruppo non è concluso. Alla fine dell’ultimo esercizio mostrare il riepilogo della seduta.
- **Criterio di chiusura:** Conferma non valida, serie intermedia e ordine di spunta diverso non provocano passaggi prematuri. Confermando tutte le serie si apre il successivo, mentre note riaperte manualmente restano utilizzabili. Il timer di recupero non viene interrotto dal cambio grafico.
- **Decisione sostituita:** Questo comportamento sostituisce sia «tutto sempre aperto» sia «attendere un clic aggiuntivo per avanzare». Note personali vuote e dettagli secondari seguono l’esercizio attivo; non vanno richiusi a ogni serie.

## Ordine proposto degli interventi

1. **Fondamenta dei dati:** MC-01, MC-02, MC-03, MC-07 e validazione dei backup di MC-20. Prima rendere affidabili salvataggi, date, identità e conteggi.
2. **Motore delle decisioni:** MC-04, MC-05, MC-06, MC-08, MC-10, MC-12 e MC-13. Allineare progressione, carichi, stime e qualità dei dati.
3. **Programmazione personale:** MC-11 e MC-14–MC-19. Integrare attrezzatura, storico, vincoli, tempo, volume e continuità dei mesocicli.
4. **Restituzione e verifica finale:** MC-09, parte interfaccia di MC-20, MC-21, MC-22, MC-23, MC-24 e MC-25. Completare report, importazioni, aggiornamenti, presentazione dei consigli e prove reali.

L’ordine esprime dipendenze, non quattro rilasci già approvati. In particolare MC-09 dipende dalle identità e dai conteggi corretti; MC-18 dipende dalla separazione delle esposizioni di MC-04. MC-22 accompagna anche i gruppi precedenti, quando serve una verifica reale.

## Comportamenti da preservare

- Separazione fra prescrizione e prestazione eseguita, preferenze versionate e possibilità di annullare.
- Memoria dei parametri personali, con campi precompilati e modificabili nel mesociclo successivo.
- Preferenza del bilanciere per esercizio e rispetto di quantità e diametri dei dischi.
- Uso prudente delle prestazioni confermate e datate, distinguendo fatica locale e generale.
- Modifiche future esplicite e reversibili, protezione delle code per account e gestione dei conflitti.
- Archivi e backup completi; distinzione fra contributi muscolari diretti e indiretti.

Il primo mesociclo esterno non viene eliminato. Sono disponibili archiviazione recuperabile ed esclusione reversibile dalle decisioni future, mantenendo le prestazioni consultabili. Non sono stati modificati dati reali durante lo sviluppo.

## Regole per la successiva fase di lavoro

- Conservare gli identificativi MC-01–MC-25; nuovi riscontri partiranno da MC-26.
- Integrare le ulteriori analisi prima di fissare il perimetro definitivo delle correzioni.
- Distinguere sempre difetti confermati, scelte di prodotto e verifiche ancora aperte.
- Prima delle modifiche, controllare la revisione effettiva del repository e le modifiche già confluite: evitare di duplicare interventi delle PR 87, 90 o aggiornamenti successivi.
- Per ogni punto implementato registrare revisione, verifica svolta, risultato ed eventuali limiti residui. Un controllo automatico superato non chiude da solo i casi reali ancora aperti.
- Non considerare formule, soglie di ripetizioni o intervalli di volume come garanzie individuali: il coach deve motivare le decisioni e dichiarare quando i dati non bastano.

## Registro delle revisioni

- **1.0 — 22 ottobre 2026:** registrati i 22 punti dell’audit.
- **1.1 — 22 ottobre 2026:** precisati MC-03, MC-04 e MC-05 sulla base della prova tra giorni diversi e delle foto; aggiunti MC-23 (impaginazione ed effetti) e MC-24 (riepilogo e significato visivo del RPE). Nessuna modifica alla webapp o ai dati. Il nome del file originale è mantenuto per conservare il collegamento già condiviso.

**Esecuzione:** un solo commit conclusivo dopo i controlli. Nessun deployment e nessuna modifica del diario reale.

- **1.2 — 22 ottobre 2026:** aggiunto MC-25 sul passaggio automatico; autorizzata implementazione complessiva con commit finale unico.

## Esito dell’implementazione — revisione 1.3

- **Base:** main `e6c4827ba093820222aa8bc05e3d860f9f59bf6c`, verificato sul remoto. Le PR 87, 90 e 91 sono già comprese: nessuna duplicazione delle integrazioni precedenti.
- **Motore:** 522 test automatici superati, inclusi i casi delle foto, warm-up, identità personale, carichi non uniformi, bilanciere da 9 kg, date storiche e navigazione dei gruppi.
- **Browser:** suite completa di 106 casi superata. Sono inclusi salvataggio fallito con nuovo tentativo, anteprima modificabile, passaggio automatico, proposta dello squat a 79 kg, esclusione warm-up, funzionamento offline e isolamento simulato degli account. Ulteriori esecuzioni mirate da 8 e 7 casi superate dopo le ultime rifiniture di inventario, registrazione del bilanciere e riepilogo visivo.
- **PDF reale:** esportazione di prova di cinque pagine, dodici esercizi e note lunghe, renderizzata e controllata visivamente; nessun esercizio scomparso o testo tagliato nel campione. Il documento usa dati sintetici, non il diario reale.
- **Controlli statici:** nessun errore di sintassi o spaziatura nel diff. ESLint globale mantiene 18 segnalazioni già presenti nella base; le nuove componenti non introducono errori di lint. Non si dichiara pulita la verifica globale.
- **Versione applicazione:** `1.1.0-20261022`; aggiornamento del service worker differito alla chiusura delle finestre esistenti.

### Precisazioni sulle decisioni concordate

1. Nel caso delle foto, i 79 kg eseguiti diventano un riferimento reale e visibile; non si impone automaticamente un aumento. La differenza di recupero 180/150 secondi impedisce di trasferire automaticamente un incremento. Un nuovo carico programmato e approvato esplicitamente continua ad avere precedenza sul semplice riuso della prestazione precedente.
2. Quando il nuovo mesociclo cambia range o RPE, il ricalcolo è dichiarato come nuova programmazione. La decisione storica non viene presentata come prescrizione identica della nuova seduta. Gli obiettivi per singola serie mantengono il range generale e possono essere conservati nel CSV a 12 colonne tramite un tag esplicito nelle note.
3. Il warm-up dell’intero esercizio esclude tutte le sue serie. W sulla singola serie esclude quella serie soltanto; le note testuali di avvicinamento non classificano automaticamente tutto l’esercizio. I warm-up non bloccano la conclusione delle serie allenanti.
4. Le associazioni personali al catalogo sono esplicite e reversibili, si conservano tra occorrenze e nuovi import e non riscrivono nomi originali o prestazioni. Una lat machine generica non viene automaticamente identificata con una presa particolare.
5. La politica di scarico resta centralizzata: viene mantenuta e resa esplicita la differenza prudenziale già prevista per alcuni template, senza introdurre uno scarico obbligatorio universale o una rotazione gratuita degli esercizi.
6. Le stime dei tempi e i crediti muscolari restano euristiche dichiarate. Il nuovo avvio esplicito distingue la durata totale dalle vecchie misure iniziate dopo la prima serie.

### MC-22: verifiche esterne che restano aperte

- Permessi effettivi del backend tra due account reali di prova (RLS), ciclo di prova e abbonamento scaduto, sincronizzazione e conflitti sul servizio remoto.
- Comportamento su dispositivi iOS/Android fisici, schermo bloccato, sospensione dell’app e audio in background.
- Ripresa della CI remota quando i limiti dell’account lo consentiranno.

Queste verifiche richiedono ambiente remoto/account/dispositivi appropriati. I test locali e le simulazioni non le sostituiscono; non è stata alterata la configurazione del backend o dell’abbonamento per aggirarle.

- **1.3 — 22 ottobre 2026:** registrate implementazione, verifiche locali e limitazioni esterne. Il file mantiene il nome originale per conservare il collegamento condiviso.

# Panoramica della webapp e di MyCoatch — 22 ottobre 2026

**Parere complessivo.** La webapp ha una base utile e diverse protezioni già valide. MyCoatch contiene però più percorsi di analisi che non condividono sempre identità degli esercizi, validazione delle prestazioni, formule, date e decisioni. La priorità è rendere coerente questo sistema. Aggiungere consigli o tecniche avanzate prima di farlo aumenterebbe la complessità senza garantire un coaching migliore.

**Non eliminerei il primo mesociclo soltanto perché proviene da un altro coach.** Può contenere prestazioni utili e rappresenta un caso che la webapp dovrebbe gestire. Consiglio archiviazione e un’opzione per escluderlo dalle decisioni future, mantenendolo nel diario. Esiste inoltre un problema concreto con gli identificatori dopo eliminazione e nuovo import, descritto sotto. In questa revisione non ho eliminato dati, modificato codice, creato commit o cambiato configurazioni della webapp.

**Metodo e limiti.** Ho verificato il ramo main di GitHub al commit `e6c4827ba093820222aa8bc05e3d860f9f59bf6c`: i file corrispondono al codice locale esaminato. Ho rieseguito 505 test del motore e 101 test browser locali: tutti passati. Ho aggiunto prove esplorative eseguite in memoria, senza aggiungere test o modifiche al repository, che hanno evidenziato casi non coperti dalla suite. La scheda Vercel già aperta mostra una sessione precedente, testi vecchi e modifiche in coda: non l’ho ricaricata forzatamente né usata per alterare dati. Questo è quindi un audit del codice attualmente pubblicato, integrato con osservazioni della sessione aperta e prove locali; non una certificazione del database remoto o di ogni configurazione hardware reale.

**Come leggere le priorità.** P1 = da affrontare nel prossimo intervento perché riguarda correttezza dei dati o decisioni del coach. P2 = miglioramento importante del comportamento o dell’esperienza. V = verifica necessaria su ambiente o dispositivi reali. “Riprodotto” indica una prova con dati sintetici; “codice” indica un percorso riscontrato nelle funzioni, senza provocarlo nel diario reale; “proposta” indica una scelta di prodotto da concordare, non un errore matematico dimostrato.

| Area | Esito della revisione |
|---|---|
| Registrazione serie e target per serie | Buona separazione di base; restano discrepanze nella validazione e nel significato della conferma |
| Progressione forza/ipertrofia | Regole presenti; da separare correttamente le esposizioni con ruoli diversi |
| Carichi e attrezzatura | Verifica dei bilancieri migliorata; calcolatori ancora non uniformi, manubri e cavi meno completi |
| Profilo e memoria | Preferenze versionate e ripristino funzionanti; da migliorare transazioni e gestione delle anteprime datate |
| Programmazione, volume e scarico | Buona base prudenziale; alcune regole dipendono dal template e da soglie rigide |
| Report e statistiche | Principale area di incoerenza: esercizi esterni, corpo libero, completezza e formule |
| Importazioni e backup | Funzioni utili; validazione, anteprima e conferma del salvataggio da completare |
| Sincronizzazione e account | Protezioni importanti già presenti; esiti dei salvataggi e verifica server da consolidare |
| PWA, aggiornamenti e timer | Funzioni coperte da test; serve un aggiornamento riconoscibile e verifiche su dispositivi reali |
| Test e rilascio | Suite verde; le nuove prove mostrano che servono test trasversali tra moduli |

**01 — P1 · Il successo di un’operazione deve dipendere dal salvataggio effettivo. Stato: codice.**

L’importazione CSV inserisce il mesociclo nello stato, chiama `saveAndSync()` senza attenderlo e restituisce subito successo. Anche altri percorsi, come import PDF, eliminazione e revisione settimanale, non controllano sempre il risultato. Il profilo può essere modificato in memoria prima del salvataggio: se il salvataggio fallisce, un successivo tentativo può trovarlo già identico in memoria e non ritentare la persistenza. La chiusura del mesociclo possiede invece già una gestione migliore del fallimento.

**Correzione:** preparare una copia candidata, validarla, salvarla e solo dopo confermare il cambiamento all’interfaccia; in caso di errore conservare una bozza recuperabile e permettere un vero nuovo tentativo. Distinguere “salvato sul dispositivo”, “in attesa del cloud” e “sincronizzato”. **Parere:** è la prima base della fiducia nell’app.

**02 — P1 · La data dell’allenamento non deve diventare la data dell’ultima correzione. Stato: codice.**

Togliere la spunta cancella `completedAt`; riconfermare scrive la data corrente. L’analisi recente dà precedenza a questo valore sulla data della seduta. Correggere oggi un vecchio allenamento può quindi farlo diventare una prestazione recente. Il completamento del giorno può anch’esso riscriverne la data. Inoltre alcune date giornaliere sono ricavate dall’ISO UTC, mentre il check-in usa il giorno locale.

**Correzione:** distinguere data effettiva della prestazione, momento di registrazione e ultima modifica. Per una correzione storica conservare la data reale o chiederla esplicitamente; usare una convenzione locale coerente per il giorno di allenamento. **Parere:** una memoria intelligente deve sapere quando il fatto è avvenuto, non solo quando è stato modificato.

**03 — P1 · Una sola definizione di serie valida, riscaldamento e seduta completa. Stato: riprodotto.**

Con tre serie prescritte, una marcata come riscaldamento e due allenanti confermate, il conteggio usato dal timer considera due righe allenanti, mentre il report continua ad aspettarne tre. Una seduta può quindi apparire completata in un punto e parziale in un altro. Un’altra prova mostra che il controllo del macroblocco può dichiarare il 100% con ripetizioni confermate ma kg assenti; la registrazione ordinaria della stessa prestazione non la accetterebbe. Anche RPE 5, valido nel diario, non viene contato come RPE misurato da tutti i moduli.

**Correzione:** un validatore comune e categorie distinte: dato valido, dato incompleto, riscaldamento, serie speciale, dato utilizzabile per e1RM. Decidere esplicitamente se trasformare una serie prevista in riscaldamento cambia il piano o richiede una serie sostitutiva. Il completamento deve seguire la stessa decisione ovunque.

**04 — P1 · Separare la progressione della seduta di forza da quella di volume. Stato: riprodotto.**

La Full Body può assegnare allo stesso esercizio esposizioni con ripetizioni, RPE e carichi diversi. La progressione longitudinale le raggruppa per esercizio e settimana, poi richiede che abbiano range, impegno e peso uguali. Nella prova, due settimane della sola esposizione di forza autorizzano una progressione; due settimane della sola esposizione di volume fanno altrettanto. Unendo le due esposizioni, nessuna progressione risulta qualificata.

**Correzione:** mantenere l’identità dell’esercizio e aggiungere l’identità dell’esposizione programmata, ad esempio “panca — ruolo forza” e “panca — ruolo volume”. Valutare la progressione di ogni ruolo nel tempo; condividere fra ruoli solo stime compatibili e dichiaratamente provvisorie. **Parere:** questo è uno degli interventi più importanti per il tuo obiettivo powerbuilding.

**05 — P1 · La decisione spiegata deve coincidere con la prescrizione generata. Stato: codice e caso osservato nei test.**

Il motore può spiegare “mantieni il peso e prova una ripetizione in una serie”, ma la generazione modifica il limite basso del range dell’esercizio, applicandolo alle serie previste, e ricalcola anche il peso per il nuovo RPE. Nell’esempio esaminato una decisione storica a 80 kg convive con una nuova prescrizione a 77,5 kg e range 8–8. Le note aggiunte chiariscono il ricalcolo, ma il sistema conserva due messaggi che richiedono interpretazione.

**Correzione:** produrre un unico risultato strutturato con target per ciascuna serie, peso, RPE, motivazione e momento di rivalutazione. La scheda, il riepilogo, i suggerimenti e il CSV devono derivare da quel risultato. Distinguere una microprogressione a parità di piano dalla riprogrammazione di un nuovo blocco.

**06 — P1 · Unificare la ricerca dei carichi componibili. Stato: riprodotto.**

La nuova ricerca dell’inventario trova correttamente un peso disponibile, ma il suggerimento fra esposizioni differenti usa ancora una ricerca basata su multipli dello step. Con bilanciere da 9 kg, dischi compatibili e un obiettivo teorico di circa 51,58 kg, il risolutore dell’inventario trova 51 kg; la funzione fra esposizioni non propone nulla pur essendo disponibile quel carico prudente.

**Correzione:** un solo risolutore dell’attrezzatura per generazione, precompilazione, LIVE e progressione futura. Uniformare anche intervalli ammissibili, preferenza per arrotondamenti prudenti e spiegazione del mancato suggerimento.

**07 — P1 · Identificatori permanenti dei mesocicli; eliminazione senza effetti collaterali. Stato: riprodotto.**

Il CSV usa identificatori come `meso_2`, ricavati dal numero di mesocicli presenti. Dopo aver eliminato il primo ciclo, quello con ID `meso_2` rimane; il nuovo import può ricevere ancora `meso_2`. I selettori delle statistiche finiscono con due chiavi identiche. L’eliminazione rinomina inoltre i cicli rimasti come “Mesociclo 1”, ecc., sovrascrivendo eventuali nomi personali.

**Correzione:** ID univoco immutabile, numero visuale separato, nome preservato e cestino/archiviazione con possibilità di recupero. **Parere sul primo mesociclo:** cancellarlo per aggirare il problema dei nomi sarebbe poco conveniente; preferisco conservarlo e poterlo escludere dal coaching.

**08 — P1 · Gli esercizi esterni devono essere cittadini normali del diario. Stato: codice.**

Il riconoscimento usa nomi normalizzati e alias espliciti. Gli esercizi sconosciuti possono avere prestazioni registrate, ma non ricevere la classificazione muscolare. Alcuni alias generici sono anche troppo specifici: “lat machine” viene associato alla variante con triangolo. Non è corretto dedurre automaticamente la presa da un nome generico.

**Correzione:** ID dell’esercizio, nome originale, nome personalizzato, eventuale associazione confermata al catalogo, variante e attrezzo. Consentire classificazioni personali. Un nome ambiguo deve richiedere chiarimento; un esercizio sconosciuto deve restare visibile con classificazione incompleta. Non rinominare retroattivamente lo storico.

**09 — P1 · Report completo, con motivi espliciti per i confronti assenti. Stato: codice.**

Il riepilogo sullo schermo si ferma a otto esercizi confrontabili e non presenta il resto in modo evidente. L’analisi del confronto considera giornate complete e campioni datati e omogenei: un esercizio con prestazioni valide può sparire dal confronto perché un altro esercizio della giornata è incompleto. Nella distribuzione muscolare gli sconosciuti restano fuori dal volume riconosciuto; è previsto nel calcolo, ma deve essere ben visibile all’utente.

**Correzione:** elencare tutti gli esercizi della scheda. Per ciascuno mostrare risultati, copertura dei dati e stato del confronto: disponibile, date mancanti, poche esposizioni, prescrizioni diverse o classificazione da completare. Evidenziare quanto del volume totale è classificabile. Il PDF e il dossier devono riflettere gli stessi criteri, pur avendo livelli di dettaglio diversi.

**10 — P1 · Corpo libero e statistiche. Stato: riprodotto.**

Una serie di Hamstring Walkout a 0 kg è valida per il diario, ma il filtro delle statistiche richiede un peso maggiore di zero e la elimina. Percorsi della calibrazione del ritmo usano a loro volta validazioni più ristrette.

**Correzione:** distinguere validità della serie da disponibilità del tonnellaggio o dell’e1RM. Una serie a corpo libero deve contribuire a serie, ripetizioni e aderenza senza inventare un peso corporeo o un massimale. **Parere:** un dato senza tonnellaggio resta un dato di allenamento.

**11 — P1/P2 · Dolore e limitazioni devono accompagnare la nuova programmazione. Stato: codice più proposta.**

Il check-in LIVE gestisce il dolore e la revisione settimanale lo considera, ma la generazione del nuovo mesociclo lavora principalmente sulle metriche delle prestazioni e sui vincoli dichiarati. Nei percorsi controllati non emerge un riepilogo sistematico dei movimenti risultati problematici da riesaminare prima della nuova proposta. Le esclusioni del questionario coprono soltanto una lista limitata di esercizi.

**Correzione:** distinguere affaticamento da dolore, registrare movimento interessato e limitazione pratica, e chiedere se il problema è ancora attuale al nuovo blocco. Consentire l’esclusione di ogni esercizio. Non rendere permanente automaticamente un vecchio dolore né dedurre una diagnosi dall’RPE.

**12 — P2 · Stime di forza leggibili e coerenti. Stato: riprodotto.**

Le statistiche calcolano una stima senza RPE e con limite di dieci ripetizioni; MyCoatch usa anche il RIR e arriva a dodici. Con 80 kg × 8 a RPE 6, le due funzioni restituiscono rispettivamente 101,3 e 112 kg. Con undici ripetizioni, una restituisce zero e l’altra una stima. Modelli diversi possono essere legittimi, ma non vanno presentati come la stessa misura.

**Correzione:** scegliere il modello per ciascun uso e dichiararlo; rappresentare l’assenza di una stima come “non disponibile”, non come zero. Per le decisioni del coach usare la fonte e l’affidabilità esplicite. Il limite di dodici ripetizioni è una regola prudenziale del prodotto, non una garanzia di esattezza.

**13 — P2 · Qualità dell’RPE: proposto, confermato, effettivamente corretto. Stato: proposta basata sul flusso.**

L’RPE può partire dal target e diventare dato registrato premendo la spunta dell’intera riga. È il comportamento dichiarato e testato, ma non prova che l’utente abbia valutato autonomamente lo sforzo: un’intera scheda confermata distrattamente può apparire molto affidabile.

**Correzione:** conservare la provenienza del valore e valutare un’opzione con RPE percepito inizialmente vuoto oppure una conferma breve dedicata. Mostrare i riferimenti RIR e permettere di dichiarare “non lo so”. Non confondere questo problema con l’assenza del dato. **Parere:** preferisco pochi RPE attendibili a una tabella perfettamente compilata per abitudine.

**14 — P2 · Attrezzatura completa, non soltanto incrementi numerici. Stato: codice più proposta.**

Il bilanciere beneficia di inventario e diametro; per manubri e cavi è disponibile soprattutto lo step, che non descrive tutti i pesi realmente presenti. Il form di generazione assume inoltre una dotazione base e permette di variare principalmente accessori e configurazione dei cavi. È adatto alla home gym prevista, meno generale per altri utenti.

**Correzione:** pesi effettivi dei manubri, limiti di carico, disponibilità di rack e panche, configurazione dei cavi e convenzione di registrazione. Le convenzioni “peso totale del bilanciere” e “singolo manubrio” sono già spiegate nel manuale: le terrei visibili anche vicino ai campi. Un cambio di macchina o rapporto di carrucole non dovrebbe trasferire ciecamente i kg precedenti.

**15 — P2 · Provenienza storica dell’attrezzo. Stato: codice più proposta.**

La scelta del bilanciere viene ricordata per esercizio, come richiesto. Nella conferma della prestazione non vedo però una copia sistematica dell’attrezzo realmente usato in quella specifica serie. Un’associazione modificata in futuro descrive la preferenza attuale, non necessariamente quella storica.

**Correzione:** conservare attrezzo e convenzione del peso con la prestazione, senza cambiare i kg totali già registrati. La variante attuale e quella storica devono poter essere confrontate consapevolmente.

**16 — P2 · Durata e recuperi devono riflettere anche la logistica. Stato: codice più proposta.**

Lo stimatore comprende riscaldamento, avvicinamento, recuperi, cambi e lati degli unilaterali: è una buona base. La durata delle serie rimane però quasi fissa per categoria, indipendentemente dalle ripetizioni; alcuni unilaterali sono riconosciuti tramite il nome. Il timer parte dopo la prima conferma. Esistono anche percorsi diversi di calibrazione della durata e del ritmo LIVE. Nei gruppi viene valutata l’interferenza muscolare, ma non tutto il costo pratico di cambiare accessori su una sola postazione cavi.

**Correzione:** attributi espliciti di unilateralità, stima dipendente dal lavoro previsto, logistica delle postazioni e calibrazione coerente. Distinguere durata totale della seduta e tempo misurato dal diario; rendere l’inizio della sessione più esplicito. **Parere:** per stare in 50–60 minuti contano molto i cambi attrezzo e la sostenibilità reale dei recuperi.

**17 — P2 · Volume, copertura e priorità dell’atleta. Stato: codice più proposta.**

La copertura funzionale aggiunta alla Full Body a quattro giorni è utile. Altri template conservano regole diverse e la sola presenza di uno schema non dimostra che il volume sia adeguato. Le soglie di volume sono euristiche iniziali; non misurano il minimo efficace o il massimo recuperabile del singolo utente.

**Correzione:** un controllo finale uniforme dopo tutti i tagli, con serie dirette, contributi indiretti e rinunce spiegate. Se il tempo non consente tutto, rendere esplicito il compromesso fra priorità. Apprendere gradualmente la tolleranza osservata, con un cambiamento alla volta. Evitare di trasformare crediti indiretti o quote percentuali in una misura di crescita.

**18 — P2 · Scarico e stallo: criteri coerenti tra strutture. Stato: codice più proposta.**

Lo scarico automatico usa criteri differenti per Full Body e template precedenti: nella prima non è fisso a fine blocco, negli altri può esserlo in mancanza di evidenze. La differenza è descritta nell’interfaccia, quindi non è un errore nascosto; resta una scelta da rendere più coerente. Lo stallo richiede dati molto confrontabili e la rotazione una conferma fra blocchi: è prudente, ma la separazione delle esposizioni del punto 04 va risolta prima di fidarsi del risultato.

**Correzione:** una politica centrale con ragione, dati disponibili e scelta dell’atleta. Per gli stalli valutare prima regolarità, tecnica dichiarata, recuperi, attrezzatura e completezza dei dati, poi modificare una variabile. **Parere:** conservare esercizi produttivi è corretto; la varietà non è da sola un indice di qualità del coach.

**19 — P2 · Anteprima, memoria e calibrazione per esercizio. Stato: codice più proposta.**

Versioni del profilo e snapshot del programma sono già presenti e funzionano. L’app controlla il cambiamento dell’attrezzatura dopo l’anteprima; sarebbe utile trattare anche nuovi risultati o limitazioni intervenuti nel frattempo. Alcune decisioni di onboarding dipendono dalla presenza di qualsiasi storico, non dalla presenza di storico per il singolo movimento.

**Correzione:** indicare quando l’anteprima è stata generata e su quali dati; richiedere una rivalutazione quando cambiano elementi decisivi. Calibrare i movimenti nuovi separatamente da quelli già documentati. Mantenere il check-in del giorno distinto dal profilo stabile. Non considero necessario aggiungere indiscriminatamente altri parametri personali: raccoglierei quelli che modificano davvero una decisione.

**20 — P2 · Importazioni, backup e percorsi alternativi. Stato: riprodotto/codice.**

Il backup conserva bene la struttura del diario, ma la lettura valida soprattutto i contenitori. Un backup con `loggedSets: [null]` viene accettato nella prova; servono verifiche semantiche prima del ripristino. I PDF richiedono un layout riconoscibile e le importazioni tabellari non offrono sempre una revisione completa modificabile. Esiste anche un vecchio percorso di caricamento PDF che assegnerebbe un singolo mesociclo alla radice dello stato: non ho trovato chiamanti nel flusso principale, perciò lo considero codice da eliminare o isolare, non una perdita di dati osservata sul sito.

**Correzione:** unica procedura di importazione con anteprima completa, controllo di date, recuperi, unità, target per serie e identità. Backup con versione di schema e validazione approfondita. Conservare la distinzione già corretta fra PDF leggibile, CSV tabellare e JSON ripristinabile.

**21 — P2 · Aggiornamenti PWA riconoscibili e sicuri durante una seduta. Stato: osservato/codice.**

La scheda aperta mostra ancora vecchi testi, pur essendo main aggiornato, e segnala dati in coda. Non basta dire “ricarica”: l’utente deve sapere quale versione sta usando e se può aggiornare senza interrompere l’allenamento. Il service worker usa cache statiche e attivazione immediata; la versione mostrata dalla configurazione resta generica. Alcuni lettori di file dipendono da librerie esterne e non hanno le stesse garanzie offline del diario.

**Correzione:** versione applicativa visibile, avviso “aggiornamento disponibile”, scelta di installarlo in un momento adatto e gestione delle bozze pendenti. Documentare quali funzioni sono offline. Non cancellare cache o archivio per forzare l’aggiornamento. **Parere:** la certezza di usare il codice nuovo è parte del prodotto, non un dettaglio tecnico.

**22 — V/P2 · Server, dispositivi reali e qualità delle verifiche. Stato: verifiche aperte.**

Le prove locali confermano molti flussi, inclusi account separati, conflitti cloud simulati e archivio IndexedDB. Non dimostrano le policy effettive del database remoto, il comportamento dell’account scaduto in ogni condizione o l’audio con telefono bloccato. Nel codice esaminato non ci sono tutte le definizioni server necessarie per certificare questi aspetti. I test del PDF controllano anche dati e impaginazione simulata; occorre affiancarli a un controllo visivo di PDF reali.

**Correzione/verifica:** ambiente di prova per le autorizzazioni del backend, abbonamento e ripristino; prove su iPhone/Android in background e offline; PDF reali renderizzati; test trasversali sui casi riprodotti in questo audit. Il precedente blocco dei workflow GitHub è distinto dalla correttezza del codice e va rivalutato quando l’account consente l’esecuzione. Non considero un test locale verde equivalente a una certificazione completa della produzione.

**Parere sulle basi scientifiche e sull’idea di “vero coach”.**

Ho verificato l’esistenza delle fonti recenti citate nel motore. L’[ACSM Position Stand 2026](https://pubmed.ncbi.nlm.nih.gov/41843416/) sostiene l’individualizzazione della prescrizione; non certifica le soglie e le decisioni specifiche della webapp. La [revisione 2026 sui metodi avanzati](https://pubmed.ncbi.nlm.nih.gov/41951916/) non giustifica presentare tecniche più complesse come automaticamente superiori. La [meta-regressione su volume e frequenza](https://doi.org/10.1007/s40279-025-02344-w) è un riferimento per valutare il carico di lavoro, non una misura personale del recupero.

Per il tuo powerbuilding manterrei una combinazione sostenibile di lavoro più orientato alla forza e lavoro per l’ipertrofia, con movimenti stabili quando funzionano. Hip thrust e hamstring walkout sono opzioni da valutare per funzione, tolleranza e praticità: non diventano obbligatori per il solo fatto di essere nel catalogo. La qualità di MyCoatch crescerà soprattutto se saprà usare dati coerenti, chiedere un chiarimento quando manca un’informazione e spiegare una decisione concreta con la sua affidabilità. Non proporrei un aggiornamento automatico delle regole leggendo qualunque nuovo studio senza revisione.

**Cosa conserverei dell’implementazione attuale.**

- Separazione fra prescrizioni e prestazioni confermate, inclusi i target per serie.
- Preferenze versionate, snapshot del profilo e annullamento dell’anteprima senza salvataggi nascosti.
- Verifica del diametro dei dischi e associazione del bilanciere per esercizio.
- Esclusione di dati mancanti e tecniche speciali da molte stime automatiche.
- Recupero mirato distinto dai segnali su più regioni; conferma e annullamento delle revisioni future.
- Protezioni contro sovrascritture cloud concorrenti e invio di code di altri account.
- Archivio delle sedute ripetute, backup integrale e distinzione dei crediti muscolari indiretti.

**Come organizzerei un unico intervento coordinato.**

| Pacchetto | Contenuto | Criterio per considerarlo concluso |
|---|---|---|
| 1. Integrità del diario | 01, 02, 03, 07, validazione di 20 | Salvataggi falliti non danno successo; date e nomi storici preservati; ID unici; stessi conteggi ovunque |
| 2. Identità e motore decisionale | 04, 05, 06, 08, 10, 12, 13 | Progressione separata per ruolo, unico risolutore dei pesi, stessa prestazione interpretata coerentemente |
| 3. Programmazione personalizzata | 11, 14–19 | Limiti pratici, tolleranza, recupero e disponibilità reali incidono in modo spiegabile sulla proposta |
| 4. Esperienza e rilascio | 09, import di 20, 21, 22 | Tutti gli esercizi visibili nei report, anteprima completa, aggiornamenti riconoscibili e prove su produzione/dispositivi di test |

**Scenari di accettazione da aggiungere alla suite.** Stesso esercizio con due ruoli settimanali; primo ciclo esterno con nomi personalizzati; serie a corpo libero a zero kg; serie marcata W; RPE 5 registrato ma escluso dall’e1RM; correzione di un allenamento vecchio; bilanciere da 9 kg; manubri con pesi non uniformi; cambio attrezzo; eliminazione seguita da import; errore di persistenza durante import e salvataggio profilo; backup malformato; nuovo risultato dopo anteprima; cambiamento del dolore; report con oltre otto esercizi; aggiornamento durante una sessione con dati in coda.

**Traccia tecnica dei riscontri principali.** Tutti i riferimenti seguenti sono alla revisione main esaminata.

- Salvataggio e import: [csvHandler.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/csvHandler.js#L261), [storage.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/storage.js#L283), [main.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/main.js#L306).
- Date e conferma: [workoutEvents.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/workoutEvents.js#L250), [sessionTimer.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/sessionTimer.js#L14), [recentEvidence.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/recentEvidence.js#L10).
- Completezza, statistiche e identità: [workoutSemantics.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/workoutSemantics.js#L24), [macrocyclePlanner.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/macrocyclePlanner.js#L31), [analytics.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/analytics.js#L71), [exerciseIdentity.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/exerciseIdentity.js).
- Progressione ed esposizioni: [progressionPolicy.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/progressionPolicy.js#L25), [prescriptionPolicy.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/prescriptionPolicy.js), [crossExposureLoad.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/crossExposureLoad.js#L97).
- Eliminazione e report: [mesocycle.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/mesocycle.js#L63), [mesocycleClosureUI.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/js/mesocycleClosureUI.js#L97), [volumeAccounting.js](https://github.com/Jakobs78/Diario-homegym/blob/e6c4827ba093820222aa8bc05e3d860f9f59bf6c/mycoatch/volumeAccounting.js#L101).

L’obiettivo non è garantire che non serviranno mai più manutenzione o correzioni. È approvare ora un quadro coerente, implementarlo con dipendenze chiare e verificare le regole condivise prima di introdurre nuove funzioni.

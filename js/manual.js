// User guide: static descriptions of the controls implemented in this app.
// Both chapters live in the same view; opening an article never edits the diary.
const diary = [
['iniziare','Primi passi e menu',[
 ['Accesso e account','Accedi con email e password o registrati dalla schermata iniziale, indicando il nome e, se vuoi, il cognome. Il nome dell’account compare in Strumenti e gestione.'],
 ['Strumenti e gestione','Il pulsante ⚙️ riunisce Manuale, tema chiaro/scuro, Esci, creazione/importazione schede, attrezzatura, esportazioni, backup e gestione dei dati.'],
 ['Manuale e ritorno alla seduta','Apri un argomento dall’indice oppure dalla sua intestazione. Diario e MyCoatch sono nella stessa schermata scorrevole. «Torna alla seduta» richiude la guida senza cancellare i campi o fermare il recupero.'],
 ['Tema chiaro e scuro','Cambia l’aspetto da Strumenti e gestione. La scelta resta salvata su quel browser. Il pulsante indica il tema attuale e quello che puoi attivare.'],
 ['Esci dall’account','Chiude la sessione di accesso; non elimina l’account o il diario. Prima di cambiare dispositivo controlla lo stato Cloud.'],
 ['Percorso consigliato','Configura l’attrezzatura, importa una scheda o crea una proposta MyCoatch, scegli il giorno, avvia la seduta e conferma solo le serie realmente eseguite.']
]],
['navigazione','Anni, mesocicli, settimane e giorni',[
 ['Selettori del diario','Anno → mesociclo → settimana → giorno individuano la seduta. Le frecce cambiano mesociclo; i pulsanti dei giorni aprono esercizi e note della giornata.'],
 ['Blocca / sblocca mesociclo','Il lucchetto protegge il singolo programma dalle modifiche, lasciandolo consultabile. Lo sblocco di un mesociclo concluso richiede conferma e annulla la chiusura, senza cancellarne i risultati.'],
 ['Nuovo programma','L’importazione aggiunge un mesociclo separato e conserva i precedenti. Non conclude automaticamente una vecchia scheda: usa la chiusura guidata o il lucchetto.'],
 ['Archivia il mesociclo selezionato','In Strumenti e gestione sposta il programma e le sue prestazioni nell’archivio recuperabile. Non equivale a eliminare tutto lo storico.'],
 ['Recupera ultimo mesociclo archiviato','Riporta nel diario l’ultimo programma archiviato, con le sue prestazioni. Il backup completo conserva anche gli archivi.']
]],
['serie','Registrare e correggere le serie',[
 ['Scheda originale, proposta e risultato','La prescrizione indica cosa era previsto; le celle possono proporre valori da verificare. Soltanto la spunta ✓ trasforma i valori confermati in risultati registrati.'],
 ['Kg e ripetizioni','Inserisci il peso e le ripetizioni realmente eseguite. Per i manubri usa il peso del singolo manubrio e mantieni la stessa convenzione nello storico. I pulsanti −/+ delle reps variano di una ripetizione senza cambiare il target.'],
 ['RPE percepito e obiettivo','Il target rimane sotto la cella; il campo registra lo sforzo percepito. Modificalo a mano o con −/+ di 0,5. Se lo lasci vuoto, MyCoatch non lo inventa e dispone di meno informazioni.'],
 ['Conferma ✓ e correzione','Spunta dopo l’esecuzione, verificando anche i valori precompilati. Per correggere togli la spunta, modifica e riconferma. Una serie non confermata resta una bozza.'],
 ['Esercizio attivo','Il titolo attiva la card; dopo il completamento si apre il successivo esercizio. Puoi tornare ai precedenti. Le indicazioni del coach e l’ultima esecuzione restano vicine ai campi.'],
 ['Storico vicino all’esercizio','Mostra i risultati per serie dell’ultima esecuzione pertinente, anche di un altro giorno o mesociclo. Il riferimento usato per un consiglio può essere indicato separatamente se diverso.'],
 ['Note della scheda e personali','Le prime descrivono il programma; le seconde registrano osservazioni sulla seduta. Si conservano anche nelle esportazioni complete.'],
 ['Colori e frecce','Segnalano confronti con target e risultati compatibili; non misurano tecnica o crescita muscolare. Gli intervalli stimati di kg restano nei calcoli, senza apparire sotto al peso.']
]],
['warmup','Riscaldamento, esercizi saltati e segnalazioni',[
 ['W sulla singola serie','Contrassegna il riscaldamento: i dati restano nel diario, ma la serie non conta come lavoro effettivo né impedisce il completamento della seduta.'],
 ['Intero esercizio di riscaldamento','Usa il doppio click sulla card da computer o lo scorrimento laterale intenzionale su touch, evitando i campi. La sola parola WARM-UP nelle note non esclude le serie di lavoro.'],
 ['Salta solo quest’allenamento','Scrivi il motivo nelle note personali, poi usa il pulsante dell’esercizio. Esclude il lavoro ancora da fare per oggi senza inventare spunte o cancellare le serie già registrate. «Ripristina» rende di nuovo eseguibile l’esercizio.'],
 ['Segnalazioni delle serie','Sulla serie confermata indica dolore, distrazione, problema di esecuzione, calibrazione o variazione intenzionale, con nota facoltativa. I risultati rimangono nello storico; dolore, distrazione e problemi di esecuzione escludono la serie dai calcoli del coaching.'],
 ['Conferma segnalazioni / Rispondo dopo','Salva il chiarimento oppure rimanda la domanda senza perdere i risultati. «Chiarisci le serie precedenti» permette di spiegare una discrepanza storica ancora pertinente, se il relativo mesociclo è modificabile.']
]],
['tecniche','Superserie, triset e tecniche speciali',[
 ['Superserie, triset e jumpset','Il gruppo mostra un giro alla volta. Conferma una serie per ciascun membro: il recupero parte solo a giro completo, usando il recupero dell’ultimo esercizio, anche con conferme fuori ordine.'],
 ['Passaggio al giro successivo','Alla spunta che completa un giro intermedio compare «Si riparte col giro x» per 3 secondi; poi l’app scorre al primo esercizio ancora da eseguire. Il timer continua in basso, in primo piano: il messaggio non invita a saltare il recupero.'],
 ['Pulsanti Giro 1, Giro 2…','Consentono di consultare i giri precedenti. Un giro futuro non è confermabile prima di quello corrente. Consultare un altro giro, riaprire una serie o cambiare seduta annulla il passaggio automatico pendente. A fine gruppo si passa oltre; a fine seduta si apre il riepilogo.'],
 ['Dropset: base e scarichi','Registra la base nella riga principale e ogni scarico nei campi sottostanti, con kg inferiori e reps proprie; RPE facoltativo per le fasi. Aggiungi o rimuovi le fasi prima della conferma. Una sola spunta chiude base e scarichi, senza pause intermedie.'],
 ['Ambito del dropset','Se non è specificato, scegli ultima serie oppure ogni serie secondo il programma. «Dropset non eseguito» conserva la base. Non sommare le reps degli scarichi nella riga principale.'],
 ['Top set e back-off','Sono serie con funzioni e prescrizioni proprie: non estendere il peso del top set alle serie successive. Rest-pause e myo-reps vanno letti nelle note e non hanno necessariamente l’interfaccia a fasi del dropset.']
]],
['tempo','Timer, fine seduta e ripetizione',[
 ['Inizia seduta','Avvia la misurazione della durata fin dall’inizio dell’allenamento. Le conferme delle serie alimentano comunque lo stato della seduta.'],
 ['Cronometro della sessione','Pausa/Riprendi gestisce le interruzioni. «Termina» chiede conferma per azzerare il cronometro e sbloccare la sessione; non dichiara eseguite le serie mancanti.'],
 ['Timer di recupero','Parte dopo una serie allenante valida o un giro completo, se resta lavoro. −15s e +30s regolano il tempo; ✕ lo ferma; 🔊 prova o riattiva l’audio, che può richiedere un tocco sul dispositivo.'],
 ['Completamento giornaliero','L’ultima serie necessaria apre e raggiunge automaticamente «Riepilogo seduta». Il feedback ha sfondo distinto, intestazione verde e confronto per serie. Riscaldamento ed esercizi saltati non diventano prestazioni inventate. Non parte un nuovo recupero a lavoro concluso.'],
 ['Ripeti (salva storico)','Archivia la seduta completata prima di preparare una nuova esecuzione dello stesso giorno. «Sedute precedenti salvate» mostra le ripetizioni archiviate, compresi note e scarichi.']
]],
['attrezzatura','Attrezzatura e calcolo dei dischi',[
 ['Bilancieri posseduti e abituale','In Strumenti e gestione registra peso e diametro di ogni bilanciere, poi scegli quello abituale. La scelta specifica nella card viene ricordata per quell’esercizio.'],
 ['Inventari 50 mm e 29 mm','Sono separati. Indica le coppie disponibili per ciascun taglio: 25, 20, 15, 10, 5, 2,5, 2, 1,25, 1 e 0,5 kg. Due dischi uguali formano una coppia. Usa 0 per i tagli assenti e salva l’attrezzatura nel diario. Il vecchio inventario unico non viene duplicato fra i diametri.'],
 ['Incrementi di peso','Indicano il minimo scatto disponibile: sul totale del bilanciere, sul singolo manubrio o sulla scala della macchina. Sono distinti dalla quantità di dischi posseduti.'],
 ['Pesi disponibili e configurazione macchina','Puoi elencare i pesi dei manubri e dei cavi separandoli con punto e virgola. L’identificativo della configurazione evita di considerare equivalenti carichi di macchine differenti. Lascia vuoto ciò che non conosci: la disponibilità non viene inventata.'],
 ['Calcola dischi per bilanciere','Scegli il bilanciere e tocca la serie da consultare. I kg includono la barra: 70 kg totali con barra da 20 kg richiedono 25 kg per lato. Il calcolo usa solo le coppie del diametro scelto e segnala il peso mancante se la combinazione è incompleta.'],
 ['Apertura del calcolatore','Per esercizi riconosciuti con bilanciere si apre sopra 35 kg; puoi aprirlo manualmente negli altri casi ammessi. Non compare per manubri e macchine riconosciuti. Se mancano barra o inventario, configura prima la dotazione.']
]],
['importare','Importare schede e risultati',[
 ['Importa una scheda nel diario','Accetta CSV e Excel (.xlsx/.xls), mostra un’anteprima modificabile e aggiunge un programma dopo conferma. Il PDF è un’esportazione, non un formato di importazione. Excel può richiedere la connessione.'],
 ['Modello e colonne','Scarica il modello dalla finestra di importazione. Mantieni Settimana, Giorno, Blocco, Esercizio, Set, Reps, KgMin, KgMax, RPE, Recupero, Note e Topset. Il CSV dei risultati storici non è una nuova scheda.'],
 ['Associazione degli esercizi','Per un nome non riconosciuto scegli la variante esatta del catalogo oppure conserva l’esercizio personalizzato. La scelta esplicita viene ricordata per le successive importazioni.'],
 ['Tecniche nel file','Specifica le tecniche nelle Note e usa blocchi contigui coerenti, ad esempio 1A/1B/1C per un triset dichiarato. Per dropset usa [DROP_SET] con [DROP_SCOPE:LAST] o [DROP_SCOPE:ALL]. Controlla gruppi e recuperi nell’anteprima.'],
 ['Importa risultati precedenti (CSV)','Carica prestazioni nel formato previsto dallo storico; verifica anno, collocazione ed eventuali errori. Non equivale all’importazione di una scheda o al ripristino JSON.']
]],
['analisi','Analisi, record e report',[
 ['Andamento del mesociclo','Dal pulsante 📊 mostra sedute completate, tonnellaggio, RPE registrato, serie previste/confermate per muscolo e calendario. I filtri selezionano mesociclo corrente, tre mesi, un anno o storico completo.'],
 ['Progressi per esercizio e record','Seleziona l’esercizio per massimo carico registrato, massimo tonnellaggio di serie, reps a carico target e andamento carico/RPE. Un record non equivale a un massimale misurato.'],
 ['Confronta due mesocicli','Affianca risultati e aderenza di due programmi selezionati. Il selettore del mesociclo delimita anche le viste Macro/Micro.'],
 ['Analisi mesociclo','Il pulsante nella scheda apre un report dedicato con risultati, serie fatte/saltate/mancanti e qualità dei dati. «Torna all’allenamento» conserva posizione, campi e timer. Le proposte riguardano il ciclo futuro.'],
 ['Esporta l’analisi','PDF e rapporto testo (.md) sono leggibili e condivisibili; escludono note libere e dati account. Il JSON dell’analisi è per strumenti compatibili, non è un backup. Nessun report viene inviato automaticamente a ChatGPT.'],
 ['Escludi questo mesociclo dalle decisioni future','Impedisce l’uso del programma come riferimento per nuove decisioni; è reversibile e non cancella i risultati.']
]],
['backup','Esportazioni, backup e ripristino',[
 ['PDF del giorno','Scarica la scheda selezionata per leggerla o stamparla, senza modificare i risultati.'],
 ['PDF programma e report completi','Include bilancio MyCoatch, aderenza, serie/RPE, confronti e distribuzione muscolare; seguono settimane, giornate, prescrizioni, note, risultati e sedute ripetute archiviate. Non è ripristinabile come backup.'],
 ['Storico dell’anno (CSV)','Esporta i risultati dell’anno selezionato in forma tabellare. Non conserva necessariamente tutti i dettagli strutturati del diario.'],
 ['Copia completa del diario (JSON)','Conserva anni, programmi, risultati, impostazioni e archivi, anche quelli tecnici separati quando disponibili per l’account originale. Salvala fuori dal solo browser.'],
 ['Ripristina diario dal backup JSON','Dopo conferma sostituisce il diario attuale: non combina automaticamente due versioni. Prima esporta la copia che vuoi conservare.'],
 ['Elimina tutto lo storico / Elimina definitivamente l’account','Sono comandi distinti nella parte finale di Strumenti e gestione, con conferme proprie. Possono rimuovere anche dati online: non servono per aggiornare l’app o correggere una serie.']
]],
['cloud','Cloud, offline, installazione e supporto',[
 ['Indicatore Cloud','Distingue sincronizzato, in coda, offline o errore. Un salvataggio sul dispositivo non prova che l’invio online sia terminato. Attendi il completamento prima di cambiare dispositivo.'],
 ['Uso offline','Richiede che app e diario siano già disponibili sul dispositivo. Le modifiche attendono la connessione; primo accesso e operazioni cloud richiedono internet. Evita modifiche contemporanee su più dispositivi.'],
 ['Diario diverso su due dispositivi','Il conflitto sospende la sincronizzazione: scarica le copie di entrambe le versioni, confrontale e scegli quale conservare. Non avviene una fusione automatica.'],
 ['Archivi tecnici MyCoatch','Restano separati dal diario operativo, per non ritrasferire continuamente i vecchi dettagli. Consultare la guida o un consiglio invariato non crea nuovi allenamenti.'],
 ['Installa app / Aggiungi alla schermata Home','Usa il menu del browser o la condivisione sui dispositivi compatibili. L’app funziona anche dal browser.'],
 ['Aggiornamenti e versione','La versione è sotto al nome HomeGym Diary. Dopo una pubblicazione chiudi e riapri l’app online; le finestre già aperte possono trattenere la vecchia versione. Prima controlla il Cloud. Non cancellare i dati del browser per aggiornare: potresti perdere modifiche non inviate.'],
 ['Hai bisogno d’aiuto?','Apre il supporto. Indica dispositivo, funzione e messaggio riscontrato, senza inviare password.']
]]
];
const coach = [
['coach-scheda','Creare una nuova scheda con MyCoatch',[
 ['Progetta una nuova scheda','Da Strumenti e gestione apri il configuratore: obiettivo forza/ipertrofia/powerbuilding, esperienza, età, sesso facoltativo, priorità muscolari, da uno a sei giorni, da una a dodici settimane e tempo per seduta, anche personalizzato tra 25 e 180 minuti.'],
 ['Struttura e scarico','Scegli la distribuzione proposta, ad esempio Upper/Lower o Full Body, e la gestione dello scarico. Con storico insufficiente, l’opzione automatica può inserire lo scarico nell’ultima settimana dei cicli di almeno quattro settimane.'],
 ['Attrezzi, varianti e preferenze','Conferma solo dotazioni reali, macchine, accessori e configurazione cavi; scegli varianti dei fondamentali ed esercizi da evitare. Questa scelta guida gli esercizi ed è distinta dall’inventario che verifica i pesi. La barra lunga da agganciare alla puleggia alta serve alla lat machine, non alle trazioni a corpo libero. L’impugnatura triangolare è un accessorio separato; seleziona la sbarra trazioni solo se è fissa e sostiene il corpo.'],
 ['Tempo stimato','Comprende cinque minuti orientativi di riscaldamento generale, avvicinamento e due lati degli esercizi unilaterali. È una stima: confrontala con la durata reale. Lo scarico non riempie automaticamente il tempo liberato con accessori aggiuntivi.'],
 ['Impostazioni precedenti','Le impostazioni già salvate possono essere riproposte e restano modificabili. Annullare la configurazione non importa una scheda.']
]],
['coach-anteprima','Anteprima, CSV e calibrazione',[
 ['Controlla la scheda prima di decidere','Mostra giorni, esercizi, serie, reps, RPE, recuperi, stime di tempo e motivazioni senza applicare il programma. Verifica che gli esercizi siano eseguibili nella tua palestra.'],
 ['Scarica solo CSV / Genera e scarica CSV','Esporta la proposta senza importarla nel diario. Puoi controllarla o conservarla prima di decidere.'],
 ['Importa la proposta nel diario','Crea un mesociclo separato, selezionato e modificabile; conserva i programmi e i risultati precedenti. «Annulla» chiude l’anteprima senza applicarla.'],
 ['Prima settimana guidata di calibrazione','Aiuta a trovare pesi disponibili coerenti con reps e RPE quando manca uno storico attendibile. Il relativo riepilogo usa le serie realmente confermate.'],
 ['Carichi iniziali di riferimento','Kg, reps, RPE e data dichiarati aiutano la prima proposta; non sono prestazioni già registrate. La data va indicata. Se mancano riferimenti o compatibilità dell’attrezzatura, il peso può restare vuoto da calibrare.']
]],
['coach-seduta','MyCoatch durante la seduta',[
 ['Check-in iniziale','Registra sonno, energia, indolenzimento e dolore per contestualizzare la seduta. Le risposte non sono una diagnosi.'],
 ['Note e consigli nella card','Spiegano quale peso o obiettivo cambia, perché e quale riferimento viene usato. Il target RPE resta distinto dallo sforzo che registri; i normali check non producono popup di conferma.'],
 ['Correzioni delle serie successive','I risultati già confermati oggi possono adattare la proposta delle serie ancora da fare. Top set e back-off mantengono target distinti; un aumento rimane da verificare.'],
 ['Serie anomale e carico trovato','Usa «Segnalazioni delle serie» per spiegare differenze, dolore, errori o un carico scelto come riferimento di calibrazione. I dati originali restano visibili; una variazione intenzionale non viene automaticamente trattata come errore.'],
 ['Riepilogo seduta','A fine giornata si apre automaticamente e distingue visivamente tutta l’area del feedback. Mostra reps e RPE fatti/obiettivo per ciascuna serie, dati mancanti, esercizi saltati e proposte successive effettivamente disponibili.']
]],
['coach-progressione','Progressione di peso, ripetizioni e recupero',[
 ['Chiudere tutte le serie','Se mancano poche reps al limite alto, MyCoatch propone di completare le serie mancanti rispettando tecnica e RPE. Se resta più lavoro, propone un progresso graduale; una sola rep in più può essere utile.'],
 ['Aumento del carico','Quando le serie sostengono la progressione, usa gli scatti dichiarati o i pesi dell’inventario. In assenza di conferma propone un incremento pratico indicativo: ad esempio 4→5 kg è una prova, non una riuscita garantita. Microincrementi dichiarati esplicitamente restano possibili.'],
 ['Gestire il nuovo peso','Lavora nel range e rispetta l’RPE; non fermarti automaticamente al minimo se hai margine. Se raggiungi lo sforzo previsto prima del minimo, correggi il peso nella serie successiva. Un piccolo aumento non impone sempre di ripartire dal limite basso.'],
 ['Range oltre 12 reps','La progressione usa le prestazioni dirette, non il massimale stimato. RPE mancante o alto, serie incomplete, dolore, scarico e tecniche speciali possono limitare gli aumenti.'],
 ['Recuperi 150 e 180 secondi','La sola differenza non separa l’esercizio né blocca la progressione. MyCoatch considera anche ruolo della serie, reps, RPE e tecnica: una serie pesante e una più leggera non sono automaticamente equivalenti.'],
 ['Recupero molto diverso o non noto','Un recupero più lungo non blocca da solo una progressione altrimenti giustificata; uno più breve o non indicato richiede verifica. I messaggi riportano i tempi confrontati quando pertinenti. Un vecchio riferimento con pausa simile non scavalca una seduta recente più difficile.'],
 ['Riferimenti di forza e attrezzatura','L’e1RM è una stima da serie valide, non un massimale misurato. Non si trasferiscono alla cieca pesi fra configurazioni diverse di cavi; riscaldamento, scarichi e serie escluse non diventano normali prove di forza.']
]],
['coach-revisioni','Revisioni e storico usato da MyCoatch',[
 ['Proposte nelle sedute future','Il protocollo aggiorna le proposte delle serie ancora da eseguire senza riscrivere i risultati confermati. I valori inseriti manualmente rimangono distinti dal suggerimento; rileggere la stessa proposta non somma nuovi aumenti.'],
 ['Revisione dei carichi futuri','Quando presente, mostra l’effetto sulle sedute ancora intatte e richiede conferma per applicarlo. L’annullamento è disponibile solo finché le sedute interessate non sono iniziate o cambiate.'],
 ['Revisione settimanale','Quando disponibile può proporre target RPE più prudenti. L’applicazione richiede consenso; i kg futuri possono tornare da scegliere, mentre serie e reps restano quelle indicate. «Ripristina target originali» segue le condizioni mostrate.'],
 ['Finestra dello storico','Le nuove decisioni usano una finestra di quattro anni di calendario: anno corrente e tre precedenti, valutando recenza e confrontabilità. I dati più vecchi non vengono cancellati: restano consultabili e nel backup.']
]],
['coach-fine','Fine mesociclo e preparazione del prossimo',[
 ['Concludi mesociclo','Apre una revisione di sedute e serie fatte o mancanti. Il richiamo evidenziato a fine ciclo non blocca automaticamente il programma.'],
 ['Report per ChatGPT','Esporta volontariamente una sintesi testuale delle prestazioni senza dati dell’account. Aprire o scaricare il rapporto non chiude la scheda e non invia messaggi.'],
 ['Concludi e blocca','Dopo revisione e conferma chiude e protegge il programma. Se rimangono sedute incomplete serve un’ulteriore conferma; non vengono registrate come eseguite.'],
 ['Analisi e distribuzione muscolare','Interpretano aderenza, serie, RPE e confronti fra settimane. Serie dirette e crediti indiretti sono stime di lavoro, non percentuali di crescita. Le medie del lavoro eseguito distinguono le settimane concluse da quelle di scarico.'],
 ['Prepara il prossimo mesociclo','Riapre il configuratore MyCoatch con parametri da verificare. Il nuovo programma non viene importato automaticamente. Per riaprire il precedente usa Sblocca e conferma.']
]]
];
const reference = [
['glossario','Termini essenziali',[
 ['Serie / set e ripetizioni / reps','Una serie contiene le ripetizioni eseguite prima del recupero o della fase successiva prescritta.'],
 ['RPE e RIR','RPE indica lo sforzo percepito: orientativamente 7 ≈ tre reps ancora possibili, 8 ≈ due, 9 ≈ una. RIR indica le ripetizioni in riserva. Sono stime personali.'],
 ['Scarico / deload','Periodo con meno volume o sforzo, diverso dallo scarico di peso all’interno di un dropset.'],
 ['Volume, tonnellaggio e crediti indiretti','Le serie misurano il volume di lavoro; il tonnellaggio somma kg × reps. I crediti indiretti attribuiscono convenzionalmente parte del lavoro ai muscoli di supporto: non sono altre serie da eseguire.'],
 ['Upper/Lower, Full Body e macrociclo','Upper/Lower alterna parte superiore e inferiore; Full Body distribuisce i principali gruppi in ciascuna giornata. Il macrociclo è un percorso su più mesocicli da adattare, non un risultato garantito.']
]],
['problemi','Problemi frequenti',[
 ['Non riesco a confermare una serie','Controlla kg, reps, eventuale RPE non valido, fasi dropset, giro corrente e lucchetto del mesociclo.'],
 ['Il recupero non parte','Potresti essere a metà giro, su una serie di riscaldamento o a seduta conclusa. Se manca l’audio usa 🔊 e verifica il dispositivo.'],
 ['Peso vuoto o nessun aumento','Possono mancare dati confrontabili, calibrazione, attrezzatura o RPE valido. Leggi il motivo: non ogni conferma deve produrre una progressione.'],
 ['Mancano dischi nel calcolo','Verifica peso e diametro del bilanciere, coppie salvate e serie selezionata. La combinazione incompleta non raggiunge il totale richiesto.'],
 ['Dati non aggiornati su un altro dispositivo','Controlla account, connessione e stato Cloud; se c’è conflitto conserva le due copie prima di scegliere. Per errori di salvataggio esporta un backup e usa il supporto.']
]]
];
const chapters=[
 {id:'diario',title:'Funzioni del diario',intro:'Navigazione, registrazione, strumenti e gestione dei dati.',sections:diary},
 {id:'mycoatch',title:'MyCoatch: tutte le funzioni',intro:'Creazione della scheda, calibrazione, consigli e revisione del percorso. Tutto in questa stessa pagina.',sections:coach},
 {id:'riferimento',title:'Glossario e aiuto rapido',intro:'Come leggere i termini e risolvere i dubbi più comuni.',sections:reference}
];
export function renderManualView(){
 const container=document.getElementById('manual-content');if(!container)return;
 container.innerHTML=`<p class="manual-intro"><strong>Guida pratica a HomeGym Diary e MyCoatch</strong><br>Una sola pagina: scegli un argomento per leggere cosa fa ogni funzione e come usarla.</p>
 <nav aria-label="Indice del manuale">${chapters.map(c=>`<div class="manual-index-group"><h3>${c.title}</h3><div class="manual-index">${c.sections.map(([id,title])=>`<a href="#manual-${id}" data-manual-target="manual-${id}">${title}</a>`).join('')}</div></div>`).join('')}</nav>
 ${chapters.map(c=>`<section class="manual-chapter ${c.id==='mycoatch'?'manual-chapter-coach':''}" id="manual-chapter-${c.id}" aria-labelledby="manual-heading-${c.id}"><h2 id="manual-heading-${c.id}">${c.title}</h2><p class="manual-chapter-intro">${c.intro}</p>${c.sections.map(([id,title,items])=>`<details class="manual-section" id="manual-${id}"><summary>${title}</summary><div class="manual-body"><dl>${items.map(([label,description])=>`<dt>${label}</dt><dd>${description}</dd>`).join('')}</dl></div></details>`).join('')}</section>`).join('')}`;
 container.querySelectorAll('[data-manual-target]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();const section=document.getElementById(link.dataset.manualTarget);
  if(section){section.open=true;section.scrollIntoView({block:'start'});section.querySelector('summary')?.focus({preventScroll:true});}
 }));
}

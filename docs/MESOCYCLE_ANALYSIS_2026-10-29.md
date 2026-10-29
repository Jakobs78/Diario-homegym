# Analisi mesociclo — versione 1.2.8

Aggiornamento concordato il 29 ottobre 2026. L’analisi è in sola lettura; la chiusura resta esplicita. Nessuna migrazione del diario o del database.

## Interfaccia

- Pulsante «Analisi mesociclo» leggibile anche a 320 px, mantenendo il richiamo visivo dopo l’ultima spunta.
- Vista dedicata, distinta dalla seduta giornaliera. Il ritorno conserva DOM dei campi, settimana/giorno, posizione e timer. Nessuna conclusione implicita.
- Un solo elenco dei risultati per esercizio: osservazione, serie confrontate, spiegazione e limiti dei dati. Niente duplicato fra elenco di copertura e tab di progresso.
- PDF dell’analisi, rapporto completo MD e JSON nelle esportazioni avanzate. Il precedente TXT è assorbito nel rapporto completo; il formatter interno resta compatibile per gli altri consumatori.
- JSON dossier schema 2: non è un backup. Nessun invio automatico. Gli export dell’analisi escludono account, note libere, date delle sedute e dettagli degli archivi; i nomi personalizzati restano riconoscibili. Il PDF completo del diario in Strumenti continua a conservare anche note e archivio.

## Dati e confronti

Le stesse regole di validazione alimentano schermata, dossier e PDF. Distinguere serie valide, saltate intenzionalmente, mancanti e confermate invalide; le sedute concluse con esclusioni hanno un conteggio separato.

Le prescrizioni per serie restano distinte (ruoli top/backoff, range reps, RPE, kg) insieme a tecniche e scarichi strutturati. Non sommare drops come normali serie aggiuntive. Non confrontare numericamente tecniche speciali con serie ordinarie.

L’identità usa le associazioni confermate al catalogo, senza fondere varianti o attrezzature diverse. I confronti utilizzano le medesime serie, ruoli, target reps/RPE, recuperi, contesto di gruppo/ordine e stazione registrata. Servono serie complete e date in settimane reali distinte; scarichi programmati e sessioni saltate non provano un calo prestativo. Dati RPE mancanti o una differenza superiore a 0,5 impediscono il giudizio di progresso. La tolleranza di 0,5 è una regola software prudenziale, non una soglia fisiologica validata.

Etichette: miglioramento osservato, stabile, calo da verificare, calo ripetuto, dati insufficienti. Per «calo ripetuto» servono tre esposizioni confrontabili con due riduzioni consecutive; non è una diagnosi o prova di sovrallenamento. Se kg e reps cambiano in direzioni diverse, niente giudizio univoco. Nessuna stima e1RM è necessaria per questa classificazione.

## Volume e proposte

Mostrare per settimana e muscolo serie dirette previste/eseguite e crediti indiretti separati. Il coefficiente 0,5 è una convenzione contabile, non altre serie fisiche né una misura di attivazione o crescita.

Le medie del programma usano tutte le settimane pianificate. Le medie delle prestazioni e le variazioni usano solo settimane concluse non di scarico, con denominatore esplicito. Le settimane parziali restano visibili e non diventano un falso calo di volume. Confrontare medie settimanali, non totali di cicli di durata diversa. Non dedurre «migliore» da «più volume».

Proposte, mai modifiche automatiche:

- Progressione: mantenere il volume efficace; niente aumento obbligatorio delle serie.
- Stabilità su almeno tre settimane confrontabili, piano seguito senza esclusioni e almeno due check-in pertinenti regolari, nessuna difficoltà registrata: considerare un piccolo aumento mirato solo nel prossimo ciclo e se compatibile con il tempo disponibile. Non inferire recupero dalla sola prestazione.
- Calo ripetuto con difficoltà riferite in almeno due check-in pertinenti: verificare coincidenza temporale e possibile riduzione mirata o scarico. Non attribuire automaticamente la causa e non applicare uno scarico a calendario.
- Dati incompleti, un solo confronto in calo o condizioni cambiate: verificare prima di cambiare il volume.

I check-in storici devono coincidere con la data di una prestazione della stessa seduta; non usare la valutazione della readiness di oggi per riscrivere il passato.

Il mesociclo attivo conserva esercizi, numero di serie e struttura. Restano consentiti i precedenti aggiornamenti di kg, reps e note. Le proposte sul volume non modificano l’algoritmo del generatore in questa versione: sono indicazioni trasparenti per valutare il ciclo successivo.

## Esclusione dal coaching

Il flag è rispettato dai percorsi di storico/precompilazione, analisi per il generatore, volume del macrociclo, calibrazione e segnalazioni pregresse. Il diario e i report rimangono consultabili. Le proposte pendenti basate su fonti escluse vengono ricalcolate quando si apre il relativo mesociclo; campi manuali e serie confermate non vengono riscritti. Un’origine di chiusura esclusa viene rifiutata prima della generazione finché non viene riattivata.

## Basi e limiti

- Pelland et al., Sports Medicine 2026, DOI https://doi.org/10.1007/s40279-025-02344-w : dose-risposta del volume, rendimenti decrescenti e distinzione fra lavoro diretto/indiretto. Nessun optimum individuale imposto da una meta-regressione.
- Project Invictus: https://www.projectinvictus.it/volume-allenamento-bodybuilding/ : interpretare volume insieme a intensità, frequenza e recupero.
- Renaissance Periodization: https://rpstrength.com/blogs/articles/in-defense-of-set-increases-within-the-hypertrophy-mesocycle : aumento delle serie se giustificato dai risultati e dal recupero; metodo di coaching, non legge universale.
- Bell et al. 2023, consenso Delphi sul deload: https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/ : individualizzazione, gestione pianificata o autoregolata; consenso di esperti, non prova di un algoritmo ottimale.

Nessuna di queste fonti valida direttamente le etichette o le soglie numeriche del software. Il report non misura ipertrofia, recupero o cause dei cali.

## Verifiche

Test con dati sintetici e browser isolato senza accesso al diario reale dell’utente. Verificare regressioni Node e browser, mobile 320 px, round-trip con campi e timer, export/skip/target per serie, chiusura con consenso e salvataggio fallito; verificare successivamente CI GitHub e contenuti pubblicati su Vercel.

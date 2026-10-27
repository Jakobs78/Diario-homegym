# Serie speciali e comunicazione di MyCoatch — 27 ottobre 2026

Base: main 2104f4f (PR98). Versione 1.2.4, cache v76.

## Problemi riprodotti e correzioni

- Il dropset sull'ultima serie rendeva speciali anche le serie precedenti nel protocollo. Ora UI, prescrizioni, coaching live e storico condividono seriesTechnique.js: ambito ultima/tutte/singola riga; ambito ambiguo conservativo. Un dropset dichiarato ma non eseguito resta distinto dagli scarichi registrati.
- Il rest-pause poteva produrre e1RM dal coaching live e dallo storico. Ora è escluso anche con reps numeriche e senza metadati sul singolo log. Le serie speciali non alimentano le proposte ordinarie né la progressione di un blocco omogeneo; le serie normali prima del dropset restano utilizzabili.
- L'avviso generico della tecnica nascondeva RPE mancante e scostamenti della base. Per scarichi strutturati, il coaching segnala base sotto reps o sopra RPE; nessuna riduzione automatica dedotta dagli scarichi. RPE10 prescritto resta rispettato. Per notazioni composite legacy e rest-pause non si inventa un RPE della sola base. Anche il report distingue questi casi.
- Nessun messaggio ordinario ripetuto a ogni check. Dolore, errori di input e anomalie pertinenti restano visibili. Istruzioni sui gruppi limitate a superset/triset/jumpset; timer e conferma dei segmenti invariati.
- Recuperi equivalenti (120s e 2 min) sono confrontati come durate. Cambi reali comunicati una sola volta come informazione; gli avvisi per carichi realmente non componibili restano distinti.
- I riferimenti mostrano tutte le esposizioni usate, evitando di ripetere quella già nella tabella dell'ultima seduta.

## Limite della diagnosi 81–81–80

La mediana di fino a tre esposizioni per posizione può riprodurre questa sequenza con dati sintetici. Non è una prova dell'origine nel diario personale. Non viene forzato 81 sulla terza serie, né sostituito arbitrariamente il calcolo con la sola ultima seduta. Restano necessari i basedOn effettivi per una diagnosi individuale. Migliorata la visibilità dei riferimenti; preservate formule, ordinamento storico e arrotondamenti dei carichi ordinari, salvo normalizzazione delle pause equivalenti.

## Validazione

Test di regressione su ambito delle tecniche, e1RM, precompilazione, avvisi, RPE10, RPE mancante, segmenti strutturati e notazione legacy, riferimenti multipli e recuperi equivalenti. Test browser su rendering avviso base e assenza di allarme dal solo scarico intenso; suite esistente su circuiti, timer, persistenza e dropset saltato. Dati sintetici isolati, Supabase bloccato; nessuna modifica al diario personale.

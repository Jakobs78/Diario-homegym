# Audit integrato MyCoatch — 16 ottobre 2026

## Scopo e metodo

Audit del percorso **storico confermato → decisioni progressive → mesociclo → selezione nel tempo → serie live/check-in → revisione della settimana seguente → nuovo mesociclo**. Scenari sintetici e isolati: nessun dato reale di atleta e nessuna connessione Supabase. Test automatici Node, Playwright isolato e review del codice della branch `main`.

**Il software è un motore di regole euristiche, non un agente clinico né un sistema che aggiorna autonomamente la letteratura.** Test verdi provano la conformità ai casi previsti, non una superiorità fisiologica né prestazioni su persone reali.

## Risultati dell'audit e interventi

| Priorità | Riscontro verificato | Intervento |
| --- | --- | --- |
| **P1** | La revisione settimanale riduceva l'RPE di **tutti** gli esercizi anche quando l'affaticamento ripetuto emergeva solo nelle sedute del petto. Era possibile abbassare arbitrariamente le spalle o il dorso. | Evidenza per **distretto muscolare comparabile** su **almeno due sedute differenti**, serie confermate e RPE misurati; i target della settimana dopo sono modificati solo su esercizi appartenenti ai distretti coinvolti. Se la fatica riguarda muscoli diversi in due giorni, nessuna riduzione generalizzata. |
| **P1** | Una proposta visualizzata poteva restare applicabile dopo la modifica dei **dati di partenza**, se il numero di serie difficili e i target futuri erano invariati. | Check di firma/snapshot della settimana sorgente immediatamente prima della conferma; in caso di modifiche viene richiesta una nuova revisione. |
| **P2** | La continuità degli esercizi considerava sempre la **prima settimana** del mesociclo precedente, ignorando varianti confermate più recenti. | Priorità all'ultima giornata operativa non di scarico con serie confermate; fallback all'ultima giornata disponibile se non esistono dati effettivi. Scelta immutabile rispetto allo storico originale. |
| **P2** | La data del check-in era troncata al giorno **UTC** mentre quella della seduta è locale: vicino alla mezzanotte un dolore dichiarato poteva non risultare attribuito alla seduta. | Confronto dei giorni locali in runtime con data valida; test con fuso Europe/Rome e check-in oltre le 22 UTC. |

### Invarianti che l'audit verifica

1. **Generazione:** 3/4 giorni × 30/45/60/90 min × profilo principiante/avanzato × quattro settimane: fondamentali protetti, durata stimata entro budget, gruppi validi, nessuna ripetizione di nomi identici nello stesso giorno e **nessuna serie completata artificiosamente**. RPE con limiti per esperienza e scarico.
2. **Progressione tra mesocicli:** test end-to-end dalla scheda sintetica con serie confermate ma RPE assenti fino a `MyCoatch.generateNextFromHistory`. Senza RPE osservato **non si autorizzano aumenti di kg né obiettivi di reps**, e lo storico non cambia.
3. **Continuità:** la variante allenata più recentemente prevale sulle scelte vecchie e su una diversa variante di scarico, quando compatibile con attrezzatura e schema motorio.
4. **Revisione settimanale:** due giorni con difficoltà su **distretti differenti** non sono prova di difficoltà persistente dello stesso distretto; due giorni sul petto non alterano la prescrizione di spalle o dorso. Nessun intervento su set non confermati, RPE mancanti o settimana iniziata. Anteprima pura, approvazione esplicita, rollback protetto dalle correzioni manuali.
5. **Readiness live e recupero:** test esistenti per veto su dolore, no incrementi con energia/sonno scarsi, nessuna diagnosi, dropset condizionati, protezione di superset/triset nei casi storici di fatica ripetuta. Il diario rimane offline-first con CSV a 12 colonne.

### Limiti e rischi ancora aperti

| Priorità | Limite | Raccomandazione |
| --- | --- | --- |
| P2 | Il veto storico `recoveryRequired` può rendere conservativo **l'intero blocco** quando un solo esercizio mostra fatica ripetuta. È un criterio cautelativo, ma non equivale a dimostrare affaticamento sistemico. | Distinguere recupero locale e sistemico con nuove evidenze multi-distrettuali, senza rilassare i veto su dolore. Richiede studio di scenario e modifiche coordinate tra `periodizationPolicy`, `coachGuardrails` ed engine. |
| P2 | Le indicazioni sul recupero settimanale usano RPE soggettivi e check-in auto-dichiarati. Mancano sonno misurato, dolore localizzato e tecnica osservata. | Migliorare qualità dei dati e chiarezza della raccolta prima di algoritmi più aggressivi. Non diagnosticare patologie o affaticamento clinico. |
| P2 | La revisione settimanale propone un unico alleggerimento **di 0,5 RPE**, non una periodizzazione automaticamente riottimizzata di volume e carico per singoli distretti. | Valutazione prospettica della risposta su più mesocicli; non aggiungere progressioni senza misure reali. |
| P3 | La scelta dei fondamentali avviene entro template 3 giorni Full Body / 4 giorni Upper-Lower; il tempo è **stimato**, non misurato. | Confrontare durata prevista e durata effettiva, con dati di qualità e controllo delle pause, prima di scegliere split autonomi. |
| P3 | Le serie indirette `0,5` e i limiti iniziali di volume sono euristiche esplorative, non misure di attivazione o ipertrofia. | Conservare la distinzione tra volume programmato, realmente svolto e risposta fisica dell'atleta. |
| P3 | Gli studi referenziati sono uno snapshot datato, non aggiornamenti automatici. | Revisioni periodiche di DOI e cambi normativi/scientifici con traccia delle versioni. |

## Contesto scientifico verificato

- Pelland e coll., *Sports Medicine* (2026), DOI **10.1007/s40279-025-02344-w**: dose-risposta del volume con rendimenti decrescenti. Non autorizza ad aumentare automaticamente le serie su qualunque stallo.
- Zhang e coll., *Sports Medicine* (2025), DOI **10.1007/s40279-025-02176-8**: superserie come strumento di efficienza, senza superiorità sistematica nell'ipertrofia.
- Sødal e coll., *Sports Medicine - Open* (2023), DOI **10.1186/s40798-023-00620-5**: dropset a volte più veloci, senza chiaro vantaggio ipertrofico rispetto a serie tradizionali.

## Distribuzione PWA (correzione dopo audit)

L'app usa cache statiche versionate che includono `mycoatch/engine.js`, `mycoatch/weeklyReview.js` e i relativi moduli. La loro modifica richiede una nuova chiave per invalidare le vecchie copie dei file: aggiornata la cache da **v19 a v20**. Si tratta di propagazione del codice, non di una modifica ai dati di allenamento. Il deploy Vercel e l'aggiornamento effettivo sul dispositivo restano verifiche distinte dai test GitHub.

## Criterio di approvazione

**Blocco della PR finché non passano tutti i test funzionali ed E2E.** Nessuna modifica di dati privati, log completati, password, database o formato CSV; le correzioni operate dal coach restano condizionate alla qualità dell'evidenza e alla conferma esplicita. Dopo il merge, distinguere sempre stato GitHub da stato di deployment Vercel (non verificato).

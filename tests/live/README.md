# Collaudo reale HomeGym senza ChatGPT Work

Questa suite e il workflow `homegym-production-readonly.yml` sono una **fase 1 in sola lettura**, da avviare manualmente su GitHub Actions. Non serve un browser remoto ChatGPT, e **nessuna credenziale va condivisa in chat o in PR**.

## Preparazione riservata al proprietario

1. Aprire GitHub: Repository → **Settings → Secrets and variables → Actions → New repository secret**.
2. Inserire `HOMEGYM_E2E_EMAIL` = email dell'account **dedicato esclusivamente ai test**.
3. Inserire `HOMEGYM_E2E_PASSWORD` = password dell'account di test. Non usare l'account personale e non incollare credenziali nelle conversazioni o nei file.
4. Controllare il diff della PR; l'esecuzione `workflow_dispatch` è abilitata sulla versione del workflow nel branch predefinito GitHub. **La PR va prima revisionata e unita in main**. Fare merge solo dopo verifiche adeguate (la modifica aggiunge test/CI ma un merge può anche attivare il deployment Vercel).
5. Da **Actions → HomeGym production smoke test (read-only) → Run workflow** avviare il test.
6. Consultare il riepilogo del job senza pubblicare copie dei log contenenti informazioni riservate.

## Cosa prova realmente

- Risposta HTTP del deployment, presenza del controllo scarico della PR #76, manifest e file Service Worker;
- login effettivo tramite pagina web, identità dell'account e successiva persistenza della sessione;
- SELECT reale dalla tabella `workouts` di Supabase **filtrata per l'email dell'utente autenticato**;
- quando esiste una riga remota, corrispondenza della sua copia completa con lo stato letto dalla webapp;
- download del backup completo JSON dall'interfaccia e lettura/validazione in memoria sul runner effimero (nessun ripristino);
- logout e cancellazione della sessione;
- negazione preventiva di POST/PATCH/PUT/DELETE diretti a Supabase, eccetto richieste indispensabili di login, refresh e logout.

Le credenziali restano nei GitHub Actions Secrets e vengono trasmesse soltanto all'app autenticata nel browser di Chromium sul runner; non vengono stampate. Screenshot, video, trace e upload di backup come artifact sono disabilitati. La macchina temporanea viene eliminata dopo il job.

## Cosa NON prova e non deve essere interpretato come superato

- scritture su Supabase, round-trip fra dispositivi e gestione reale dei conflitti;
- RLS/isolation fra account differenti (richiederebbe verifiche delle policy e altri account autorizzati);
- resto delle operazioni mutanti sul diario e MyCoatch;
- caching/offline con SW attivo, installazione PWA, restore reale;
- equivalenza scientifica delle prescrizioni MyCoatch.

**Fase 2 (non implementata qui):** qualunque test mutante richiede un backup verificato e conservato fuori dal runner, conferma che l'account sia dedicato, dati sintetici con prefisso dedicato, confronto pre/post su Supabase e criteri di rollback. Non attivare scritture in produzione prima di tali prerequisiti. La sola presenza di CI verde non certifica il funzionamento end-to-end.

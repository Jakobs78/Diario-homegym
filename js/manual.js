// manual.js - Manuale d'uso integrato per HomeGym Diary

const manualContent = `
<div class="manual-section" style="margin-bottom: 20px; background: rgba(0, 123, 255, 0.08); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary, #007bff);">
    <h3 style="color: var(--primary, #007bff); margin-bottom: 8px; margin-top: 0;">📲 Utilizzo come Vera App Mobile (PWA)</h3>
    <p style="margin-bottom: 8px;">Per la migliore esperienza d'uso in palestra, è <strong>fortemente consigliato installare HomeGym Diary come vera e propria app</strong> sulla schermata home del tuo smartphone. Questo garantisce la visualizzazione a schermo intero, un avvio immediato e massima stabilità:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-bottom: 0;">
        <li><strong>iPhone / iOS (Safari):</strong> Tocca l'icona di condivisione 📤 in basso e seleziona <strong>"Aggiungi alla schermata Home"</strong>.</li>
        <li><strong>Android (Chrome):</strong> Tocca i tre pallini in alto a destra <code>⋮</code> e seleziona <strong>"Installa app"</strong> oppure <strong>"Aggiungi a schermata Home"</strong>.</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px; background: rgba(245, 158, 11, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
    <h3 style="color: #b45309; margin-bottom: 8px; margin-top: 0;">⚡ Architettura Offline-First</h3>
    <p style="margin-bottom: 8px; line-height: 1.5;"><strong>HomeGym Diary</strong> è progettata con un'architettura <em>Offline-First</em>: tutti i tuoi progressi, set ed esercizi vengono salvati **istantaneamente sulla memoria locale del browser (<code>localStorage</code>)**, permettendoti di allenarti senza alcuna interruzione anche in assenza di segnale o Wi-Fi.</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-bottom: 0;">
        <li><strong>Dispositivo ad uso personale:</strong> Poiché la memoria locale è legata al browser dello smartphone per garantire la continuità offline, l'app è intesa per l'utilizzo su un <strong>dispositivo personale</strong>. Evita di alternare account diversi sullo stesso dispositivo per non mescolare i dati presenti nella cache locale prima del sync.</li>
        <li><strong>Sincronizzazione Cloud:</strong> Non appena il dispositivo torna online, i dati locali vengono sincronizzati in background sul tuo account cloud protetto da Supabase.</li>
    </ul>
</div>
<div class="manual-section" style="margin-bottom: 20px; background: rgba(16, 185, 129, 0.08); padding: 15px; border-radius: 8px; border-left: 4px solid #10b981;">
    <h3 style="color: #059669; margin-bottom: 8px; margin-top: 0;">🛡️ Sincronizzazione Cloud e Pulizia del Browser (PWA)</h3>
    <p style="margin-bottom: 8px; line-height: 1.5;"><strong>I tuoi dati sono al sicuro!</strong> Poiché HomeGym Diary salva i tuoi progressi sul cloud tramite Supabase, lo storico dei tuoi allenamenti non andrà mai perso. Tuttavia, se decidi di svuotare la cache o la memoria dello smartphone, è fondamentale seguire una semplice precauzione:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-bottom: 0;">
        <li><strong>Sincronizza sempre prima di pulire:</strong> Prima di effettuare qualsiasi operazione di pulizia del browser, apri l'app con una connessione Internet attiva e assicurati che l'indicatore in alto mostri lo stato 🟢 <em>Sincronizzato</em>. Questo garantisce che anche gli ultimi dati registrati offline siano inviati al server.</li>
        <li><strong>Dati protetti online:</strong> Tutti gli allenamenti già inviati al cloud rimangono perfettamente conservati ed esenti da qualsiasi pulizia locale del dispositivo.</li>
        <li><strong>Cosa succede dopo la pulizia:</strong> La rimozione dei dati locali disconnetterà temporaneamente il tuo account. Al riavvio successivo ti basterà avere la connessione attiva per effettuare il login: l'app riscaricherà automaticamente l'intera scheda e lo storico dal cloud.</li>
    </ul>
</div>
<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">📖 Benvenuto in HomeGym Diary</h3>
    <p><strong>HomeGym Diary</strong> è un'applicazione web avanzata progettata per la programmazione, il tracciamento e l'analisi dei tuoi allenamenti in home gym. L'app combina la flessibilità di un'architettura offline-first con la sicurezza della sincronizzazione cloud tramite Supabase.</p>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">🔐 Autenticazione e Sincronizzazione Cloud</h3>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Accesso Cloud:</strong> Tutti i dati di allenamento sono associati al tuo account personale protetto da autenticazione Supabase.</li>
        <li><strong>Stato Sincronizzazione:</strong> L'indicatore nell'intestazione mostra in tempo reale lo stato della connessione (es. 🟢 <em>Sincronizzato</em>).</li>
        <li><strong>Supporto Offline:</strong> Grazie al Service Worker integrato, puoi registrare i tuoi allenamenti anche in assenza di connessione internet. I dati verranno sincronizzati automaticamente al ripristino della rete.</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">📅 Navigazione e Struttura Temporale</h3>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Mesocicli:</strong> Utilizza i pulsanti <code>-</code> e <code>+</code> accanto alla voce <em>Mesociclo</em> per passare da un ciclo di allenamento all'altro.</li>
        <li><strong>Settimane:</strong> Seleziona la settimana di riferimento (da 1 a 4) tramite il selettore dedicato nella barra di navigazione.</li>
        <li><strong>Giorni:</strong> I tab dinamici mostrano i giorni di allenamento programmati per la settimana corrente.</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">⏱️ Gestione dei Tempi di Recupero e Sessione</h3>
    <p>Il cronometro di sessione si avvia automaticamente spuntando la prima serie. Dalla barra superiore puoi:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>Pausa / Riprendi (⏸️/▶️):</strong> Congela temporaneamente il conteggio del tempo accumulato senza perdere i secondi trascorsi.</li>
        <li><strong>Termina (⏹️):</strong> Azzera il timer e sblocca la sessione per il giorno corrente in caso di necessità.</li>
    </ul>
    <p style="margin-top: 8px;">Durante la sessione, il <strong>Timer Fluttuante</strong> permette di gestire il recupero con comandi rapidi (<code>-15s</code>, <code>+30s</code>).</p>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">🛡️ Gestione Esercizi (Warmup e Massimali)</h3>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Esclusione Blocco:</strong> Puoi escludere un esercizio dal conteggio dei massimali e del completamento sessione tramite <strong>doppio click</strong> sull'intestazione della scheda o <strong>swipe laterale</strong>.</li>
        <li><strong>Filtraggio Riscaldamento Intelligente:</strong> Tutte le serie contrassegnate come Warmup o gli esercizi disattivati vengono automaticamente scartati dai calcoli del tonnellaggio, dei volumi per distretto muscolare e dai Record Personali (PR).</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">📊 Hub Analitico Unificato</h3>
    <p>Accedi al menu <strong>Analisi & Dashboards</strong> per consultare grafici e KPI interattivi suddivisi in 3 sotto-sezioni:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>📈 Macro Mesociclo:</strong> Monitora Aderenza %, Volume Totale (Tonnellaggio netto) e livello medio di Fatica RPE (con avviso automatico di Deload consigliato). Include il grafico a barre orizzontali del volume settimanale per distretto muscolare.</li>
        <li><strong>🎯 Micro Esercizio & PR:</strong> Seleziona un esercizio dal menu a tendina per isolare i tuoi Record Personali storici (Carico Max, Tonnellaggio Singola Serie, Reps Target) e visualizzare il grafico doppio asse <em>Carico Max vs RPE Percepito</em>.</li>
        <li><strong>🔄 Confronto Mesocicli:</strong> Grafico Radar comparativo per analizzare le differenze di Volume, Intensità, Aderenza e Hard Sets tra mesocicli diversi.</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">⚙️ Strumenti & Gestione</h3>
    <p>Il menu <strong>Strumenti & Gestione</strong> raccoglie le funzionalità di manutenzione, importazione e backup:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>📖 Manuale d'uso:</strong> Visualizza questa guida interattiva.</li>
        <li><strong>🖨️ PDF giornaliero:</strong> Esporta il report della scheda giornaliera in formato PDF.</li>
        <li>
            <strong>📂 Importa scheda (Excel / CSV):</strong> Carica un nuovo piano di allenamento direttamente da file Excel (.xlsx, .xls) o CSV.
            <ul style="margin-top: 4px; padding-left: 18px;">
                <li><strong>Modello di Esempio:</strong> Download diretto del modello Excel pre-formattato.</li>
                <li><strong>Protezione Mesociclo Attivo:</strong> Avviso di conferma prima di sovrascrivere un ciclo in corso.</li>
                <li><strong>Riconoscimento Tecniche:</strong> Individuazione automatica di <em>Triset</em>, <em>Dropset</em> e <em>Superset</em> con raggruppamento grafico dei blocchi (es. 1A, 1B, 1C).</li>
            </ul>
        </li>
        <li><strong>💾 Backup storico CSV:</strong> Esporta una copia di sicurezza completa dello storico.</li>
        <li><strong>📥 Import storico CSV:</strong> Ripristina o importa dati storici da file CSV.</li>
    </ul>
    <h4 style="color: #dc2626; margin-top: 12px; margin-bottom: 6px;">⚠️ Zona Pericolosa</h4>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Elimina scheda mesociclo:</strong> Rimuove la programmazione del mesociclo corrente.</li>
        <li><strong>Elimina tutto!:</strong> Cancella permanentemente tutti i dati salvati (richiede conferma esplicita).</li>
    </ul>
</div>

<div class="manual-section" style="margin-top: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">✨ Ultime Novità & Aggiornamenti</h3>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>📱 Esperienza PWA Nausea-Free:</strong> Pieno supporto all'installazione su schermata Home con salvataggio offline locale istantaneo.</li>
        <li><strong>📊 Hub Analitico Unificato (<code>analytics.js</code>):</strong> Nuova architettura organizzata in 3 Sub-Tab (Macro Mesociclo, Micro Esercizio/PR e Confronto Radar) elaborata in locale.</li>
        <li><strong>🛡️ Filtro Automatico Warmup:</strong> Esclusione nativa di tutte le serie di riscaldamento dai conteggi di volume, tonnellaggio e record personali.</li>
        <li><strong>📈 Grafico Doppio Asse Carico vs RPE:</strong> Visualizzazione coordinata tra carichi massimi sollevati ed RPE percepito sessione per sessione.</li>
        <li><strong>🔒 Blocco di Sicurezza Mesociclo:</strong> Pulsante <code>🔒/🔓</code> per congelare il mesociclo attivo e prevenire sovrascritture involontarie.</li>
    </ul>
</div>
`;

/**
 * Inietta autonomamente il manuale nel DOM
 */
export function renderManualView() {
    const manualContainer = document.getElementById('manual-content');
    if (manualContainer) {
        manualContainer.innerHTML = manualContent;
    }
}
// manual.js - Manuale d'uso integrato per HomeGym Diary

const manualContent = `
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
    <p style="margin-top: 10px;">Il sistema interpreta inoltre automaticamente diverse notazioni per i tempi di recupero dei singoli esercizi:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>Numeri puri &le; 10:</strong> Minuti moltiplicati per 60 (es. <code>2</code> = 120s).</li>
        <li><strong>Numeri puri &gt; 10:</strong> Secondi diretti (es. <code>90</code> = 90s).</li>
        <li><strong>Notazione con due punti (<code>:</code>):</strong> Minuti e secondi (es. <code>1:30</code> = 90s).</li>
        <li><strong>Etichette testuali:</strong> Formati con <code>min</code>, <code>m</code>, <code>'</code>, <code>s</code>, <code>sec</code> o <code>"</code>.</li>
        <li><strong>Valori assenti:</strong> Viene applicato un default di 90 secondi.</li>
    </ul>
    <p style="margin-top: 8px;">Durante la sessione, il <strong>Timer Fluttuante</strong> permette di gestire il recupero con comandi rapidi (<code>-15s</code>, <code>+30s</code>).</p>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">🛡️ Gestione Esercizi (Warmup e Massimali)</h3>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Esclusione Blocco:</strong> Puoi escludere un esercizio (utile per esercizi di riscaldamento o complementari di warmup) dal conteggio dei massimali e del completamento sessione.</li>
        <li><strong>Come attivarla:</strong> Esegui un <strong>doppio click</strong> sull'intestazione della scheda dell'esercizio oppure effettua uno <strong>swipe laterale</strong> sul blocco. I dati inseriti resteranno salvati ma la scheda apparirà opacizzata e marcata come esclusa.</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">📊 Analisi & Dashboards</h3>
    <p>Accedi al menu <strong>Analisi & Dashboards</strong> per visualizzare metriche dettagliate:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>Allenamento:</strong> Vista operativa della scheda in esecuzione.</li>
        <li><strong>Statistiche:</strong> Dashboard sul volume muscolare sviluppato.</li>
        <li><strong>Progressi:</strong> Analitiche e trend di performance del mesociclo.</li>
        <li><strong>Macro Progressi:</strong> Monitoraggio pluriennale dell'evoluzione dei massimali (1RM).</li>
    </ul>
</div>

<div class="manual-section" style="margin-bottom: 20px;">
    <h3 style="color: var(--primary); margin-bottom: 8px;">⚙️ Strumenti & Gestione</h3>
    <p>Il menu <strong>Strumenti & Gestione</strong> raccoglie le funzionalità di manutenzione, importazione e backup:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>📖 Manuale d'uso:</strong> Visualizza questa guida interattiva.</li>
        <li><strong>🖨️ PDF giornaliero:</strong> Esporta il report della scheda giornaliera in formato PDF.</li>
        <li>
            <strong>📂 Importa scheda CSV mesociclo:</strong> Carica un nuovo piano di allenamento da CSV o testo copiato (Excel/PDF).
            <ul style="margin-top: 4px; padding-left: 18px;">
                <li><strong>Protezione Mesociclo Attivo:</strong> Se il mesociclo in corso non risulta completato, l'app mostra un avviso di conferma prima dell'importazione.</li>
                <li><strong>Riconoscimento Tecniche:</strong> Riconosce automaticamente <em>Triset</em>, <em>Dropset</em> e <em>Superset</em> nelle note raggruppando i blocchi (es. 1A, 1B, 1C).</li>
                <li><strong>Sanitizzazione Unità:</strong> Rimuove automaticamente le diciture duplicate (es. <code>kg</code>) dai target di peso importati.</li>
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
        <li><strong>⚡ Riconoscimento Automatico Tecniche Speciali:</strong> Durante l'importazione della scheda, l'app individua automaticamente note contenenti <em>Superset</em>, <em>Triset</em> o <em>Dropset</em>, evidenziando e raggruppando graficamente i blocchi correlati (es. 1A, 1B, 1C) per un'esecuzione guidata.</li>
        <li><strong>📊 Supporto Nativo Excel (.xlsx / .xls):</strong> Importazione diretta di file Excel formattati senza bisogno di convertirli manualmente in CSV, con possibilità di scaricare un modello di esempio pronto all'uso.</li>
        <li><strong>🔒 Blocco di Sicurezza Mesociclo:</strong> Pulsante <code>🔒/🔓</code> per congelare il mesociclo attivo e prevenire sovrascritture, modifiche involontarie o cancellazioni accidentali durante l'allenamento.</li>
        <li><strong>🔄 Sincronizzazione al Risveglio da Standby:</strong> Rilevamento automatico delle modifiche effettuate su altri dispositivi non appena la pagina viene riaperta o lo smartphone si risveglia dallo standby.</li>
        <li><strong>🎯 Pre-compilazione Intelligente Target:</strong> Calcolo dinamico e suggerimento dei carichi di partenza (Topset, Kg min/max) sui nuovi mesocicli basato sulle prestazioni storiche registrate.</li>
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
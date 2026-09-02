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
    <h3 style="color: var(--primary); margin-bottom: 8px;">⏱️ Gestione dei Tempi di Recupero</h3>
    <p>Il sistema interpreta automaticamente diverse notazioni per i tempi di recupero inseriti negli esercizi:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>Numeri puri &le; 10:</strong> Interpretati come minuti e moltiplicati per 60 (es. <code>2</code> = 120 secondi)[cite: 18].</li>
        <li><strong>Numeri puri &gt; 10:</strong> Considerati direttamente in secondi (es. <code>90</code> = 90 secondi)[cite: 18].</li>
        <li><strong>Notazione con due punti (<code>:</code>):</strong> Converte minuti e secondi separati dal simbolo (es. <code>1:30</code> = 90 secondi)[cite: 18].</li>
        <li><strong>Etichette di minuti:</strong> Stringhe contenenti <code>min</code>, o terminanti con <code>m</code> o <code>'</code> (es. <code>2min</code>, <code>2m</code>, <code>2'</code>)[cite: 18].</li>
        <li><strong>Etichette di secondi:</strong> Stringhe contenenti <code>s</code>, <code>sec</code> o terminanti con <code>"</code> (es. <code>90s</code>, <code>90sec</code>)[cite: 18].</li>
        <li><strong>Notazione con punto (<code>.</code>):</strong> Se minore o uguale a 10 con decimali validi, convertita in minuti e secondi (es. <code>1.30</code> = 90 secondi)[cite: 18].</li>
        <li><strong>Valori assenti o non validi:</strong> Viene applicato un valore predefinito di 90 secondi[cite: 18].</li>
    </ul>
    <p style="margin-top: 8px;">Durante la sessione, il <strong>Timer Fluttuante</strong> permette di gestire il recupero con comandi rapidi (<code>-15s</code>, <code>+30s</code>) e monitorare il tempo di sessione live.</p>
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

<div class="manual-section">
    <h3 style="color: var(--primary); margin-bottom: 8px;">⚙️ Strumenti & Gestione</h3>
    <p>Il menu <strong>Strumenti & Gestione</strong> raccoglie le funzionalità di manutenzione e backup:</p>
    <ul style="padding-left: 20px; line-height: 1.6; margin-top: 6px;">
        <li><strong>📖 Manuale d'uso:</strong> Visualizza questa guida interattiva.</li>
        <li><strong>🖨️ PDF giornaliero:</strong> Esporta il report della scheda giornaliera in formato PDF.</li>
        <li><strong>📂 Importa scheda CSV mesociclo:</strong> Carica un piano di allenamento tramite file CSV.</li>
        <li><strong>💾 Backup storico CSV:</strong> Esporta una copia di sicurezza completa dello storico.</li>
        <li><strong>📥 Import storico CSV:</strong> Ripristina o importa dati storici da file CSV.</li>
    </ul>
    <h4 style="color: #dc2626; margin-top: 12px; margin-bottom: 6px;">⚠️ Zona Pericolosa</h4>
    <ul style="padding-left: 20px; line-height: 1.6;">
        <li><strong>Elimina scheda mesociclo:</strong> Rimuove la programmazione del mesociclo corrente.</li>
        <li><strong>Elimina tutto!:</strong> Cancella permanentemente tutti i dati salvati (richiede conferma esplicita).</li>
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
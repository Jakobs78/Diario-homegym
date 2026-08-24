// Manuale d'uso e Guida alla formattazione CSV della Web App

export function renderManualView() {
    return `
        <div style="max-width: 850px; margin: 0 auto; padding: 20px; font-family: inherit; color: #1f2937; line-height: 1.6;">
            
            <!-- Intestazione -->
            <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 24px;">
                <h2 style="font-size: 1.75rem; font-weight: 800; color: #111827; margin: 0 0 4px 0;">📖 Manuale d'Uso & Specifiche</h2>
                <p style="color: #6b7280; font-size: 0.95rem; margin: 0;">Guida completa alle funzionalità della web app e alle specifiche tecniche per i file di allenamento.</p>
            </div>

            <!-- SEZIONE 1: GUIDA CSV -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">📁 1. Guida alla Formattazione del File CSV</h3>
                <p style="font-size: 0.9rem; margin-bottom: 12px;">
                    L'applicazione legge le schede di allenamento direttamente da file CSV strutturati in blocchi giornalieri e settimanali. Per un corretto funzionamento e parsing dei dati, il file deve contenere le seguenti colonne chiave:
                </p>
                
                <div style="overflow-x: auto; margin-bottom: 12px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                        <thead>
                            <tr style="background: #f3f4f6; border-bottom: 1px solid #d1d5db;">
                                <th style="padding: 8px; border: 1px solid #e5e7eb;">Colonna CSV</th>
                                <th style="padding: 8px; border: 1px solid #e5e7eb;">Descrizione / Formato accettato</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Settimana / Week</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Numero intero della settimana del mesociclo (es. 1, 2, 3...).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Giorno / Day</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Numero o nome del giorno di allenamento (es. 1, 2, 3 o A, B, C).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Blocco</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Raggruppamento logico dell'esercizio (es. A1, B1 o superset).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Esercizio</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Nome ufficiale dell'esercizio (es. <i>Panca Piana</i>).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Set</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Numero totale di serie previste (es. 4).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Reps</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Ripetizioni fisse o range (es. <code>8</code> oppure <code>6-8</code>).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Kg / KgMin / KgMax</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Carico fisso (es. <code>80</code>) o range di riferimento (es. Min: <code>80</code>, Max: <code>90</code>).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Topset</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Valore opzionale per la gestione dei carichi di punta nella settimana 1.</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">RPE</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Indice di sforzo percepito target (es. 8 o 8.5).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Recupero</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Tempo di recupero in secondi (es. 120).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">NoteAllenatore</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Eventuali direttive testuali del coach visualizzate nel box blu dedicato.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- SEZIONE 2: CALCOLATORE DISCHI LIVE -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">⚖️ 2. Calcolatore Dischi Live (Home Gym)</h3>
                <p style="font-size: 0.9rem; line-height: 1.5; margin-bottom: 8px;">
                    Ogni esercizio è equipaggiato con un sistema di calcolo dei dischi integrato direttamente nell'intestazione:
                </p>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151;">
                    <li style="margin-bottom: 6px;"><b>Selettore Bilanciere Rapido:</b> Scegli al volo il tipo di attrezzo usato (es. <i>Bil. 20kg Olimpico, 15kg, 10kg EZ, 8kg, 0kg per manubri</i>).</li>
                    <li style="margin-bottom: 6px;"><b>Aggiornamento in tempo reale:</b> Non appena digiti o modifichi il carico nel <b>Set 1</b>, il box azzurro calcola istantaneamente la scomposizione esatta dei dischi da montare su <i>ciascun lato</i> (partendo dai tagli standard da 25kg fino a 0.5kg).</li>
                </ul>
            </div>

            <!-- SEZIONE 3: STORICO E PROGRESSIONE -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">📊 3. Storico, Confronti e Controlli</h3>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151; margin-bottom: 0;">
                    <li style="margin-bottom: 6px;"><b>Scorsa Sessione:</b> Sotto l'intestazione trovi sempre il promemoria di cosa hai sollevato nella sessione precedente per facilitare il sovraccarico progressivo.</li>
                    <li style="margin-bottom: 6px;"><b>Indicatori di Scostamento (Testo Rosso):</b> Dalla settimana 2 in poi, se il carico o le ripetizioni inserite si discostano dai parametri originari del CSV, l'app evidenzia il testo in rosso per segnalarlo.</li>
                    <li style="margin-bottom: 6px;"><b>Gestione Warm-up:</b> Ogni set dispone della spunta "Escludi da statistiche" per marcare le serie di riscaldamento ed evitarne l'impatto sui calcoli di volume totali.</li>
                </ul>
            </div>

        </div>
    `;
}
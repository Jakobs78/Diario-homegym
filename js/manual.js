// Manuale d'uso e Guida alla formattazione CSV della Web App

export function renderManualView() {
    return `
        <div style="max-width: 850px; margin: 0 auto; padding: 20px; font-family: inherit; color: #1f2937; line-height: 1.6;">
            
            <!-- Intestazione -->
            <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 24px;">
                <h2 style="font-size: 1.75rem; font-weight: 800; color: #111827; margin: 0 0 4px 0;">📖 Manuale d'Uso & Specifiche</h2>
                <p style="color: #6b7280; font-size: 0.95rem; margin: 0;">Guida completa alle funzionalità della web app, gestione cloud e specifiche tecniche per i file di allenamento.</p>
            </div>

            <!-- SEZIONE 1: GUIDA CSV -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">📁 1. Guida alla Formattazione del File CSV</h3>
                <p style="font-size: 0.9rem; margin-bottom: 12px;">
                    L'applicazione legge le schede di allenamento direttamente da file CSV strutturati. Il file deve rispettare la struttura a colonne mostrata nell'esempio sottostante (con 6 righe di esempio che variano settimane, giorni e formati di recupero):
                </p>

                <!-- ANTEPRIMA GRAFICA DEL FILE CSV (6 RIGHE) -->
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #4b5563; text-transform: uppercase; margin-bottom: 6px;">📋 Esempio visivo della struttura CSV (6 righe):</div>
                    <div style="overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
                            <thead>
                                <tr style="background: #e2e8f0; border-bottom: 2px solid #cbd5e1; color: #0f172a; font-weight: 700;">
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Settimana</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Giorno</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Blocco</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Esercizio</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Set</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Reps</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">KgMin</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">KgMax</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Topset</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">RPE</th>
                                    <th style="padding: 6px 8px; border-right: 1px solid #cbd5e1;">Recupero</th>
                                    <th style="padding: 6px 8px;">NoteAllenatore</th>
                                </tr>
                            </thead>
                            <tbody style="color: #334155;">
                                <!-- Riga 1 -->
                                <tr style="border-bottom: 1px solid #e2e8f0; background: #ffffff;">
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">Panca Piana</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">4</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">8</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">80</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">85</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">8</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">120</td>
                                    <td style="padding: 6px 8px;">Fermo al petto</td>
                                </tr>
                                <!-- Riga 2 -->
                                <tr style="border-bottom: 1px solid #e2e8f0; background: #ffffff;">
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">Trazioni alla sbarra</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">3</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">6</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">100</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">8.5</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2min</td>
                                    <td style="padding: 6px 8px;">superset</td>
                                </tr>
                                <!-- Riga 3 -->
                                <tr style="border-bottom: 1px solid #e2e8f0; background: #ffffff;">
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">Squat Libero</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">4</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">5</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">120</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">8</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1.30</td>
                                    <td style="padding: 6px 8px;">Profondità valida</td>
                                </tr>
                                <!-- Riga 4 -->
                                <tr style="border-bottom: 1px solid #e2e8f0; background: #ffffff;">
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">Leg Extension</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">3</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">10</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">40</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">45</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">9</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">90s</td>
                                    <td style="padding: 6px 8px;">Contrazione di picco</td>
                                </tr>
                                <!-- Riga 5 -->
                                <tr style="border-bottom: 1px solid #e2e8f0; background: #ffffff;">
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">Lento Avanti</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">3</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">8</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">45</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">50</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">8</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1:30</td>
                                    <td style="padding: 6px 8px;">Settimana 2 incremento</td>
                                </tr>
                                <!-- Riga 6 -->
                                <tr style="background: #ffffff;">
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">1</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">2</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">Alzate Laterali</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">4</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">12</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;"></td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">12</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">9</td>
                                    <td style="padding: 6px 8px; border-right: 1px solid #e2e8f0;">60</td>
                                    <td style="padding: 6px 8px;">Controllo discesa</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <p style="font-size: 0.9rem; margin-bottom: 12px;">
                    Dettaglio delle colonne e regole di compilazione:
                </p>
                
                <div style="overflow-x: auto; margin-bottom: 12px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                        <thead>
                            <tr style="background: #f3f4f6; border-bottom: 1px solid #d1d5db;">
                                <th style="padding: 8px; border: 1px solid #e5e7eb;">Colonna CSV</th>
                                <th style="padding: 8px; border: 1px solid #e5e7eb;">Descrizione / Regola</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Settimana/ Week</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Numero della settimana del mesociclo (es. 1, 2, 3...).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Giorno/ Day</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Numero del giorno all'interno della settimana (es. 1, 2...).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Blocco</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Valore puramente numerico (es. <code>1</code>, <code>2</code>, <code>3</code>) per identificare i blocchi dell'allenamento.</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Esercizio</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Nome ufficiale dell'esercizio (es. <i>Panca Piana</i>). Attenzione, usare sempre lo stesso nome per l'esercizio, altrimenti la webapp li interpreterà come esercizi diversi.</td>
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
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">KgMin / KgMax</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;"><b>Regola Carichi:</b> Se compili <code>KgMin</code> e <code>KgMax</code>, il campo <b>Topset deve rimanere vuoto</b>.</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Topset</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;"><b>Regola Topset:</b> Se compili <code>Topset</code>, i campi <b>KgMin e KgMax devono rimanere vuoti</b>.</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">RPE</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Indice di sforzo percepito target (es. 8 o 8.5).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Recupero</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Tempo di recupero. Supporta in automatico diversi formati: secondi puri (es. <code>120</code>), minuti con etichetta (es. <code>2min</code>), o separati da punto/due punti (es. <code>1.30</code> o <code>1:30</code>).</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">NoteAllenatore</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">Eventuali direttive o note o stili di esecuzione</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- BOX REGOLE -->
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; margin-top: 14px; font-size: 0.85rem; color: #334155;">
                    <div style="font-weight: 700; text-transform: uppercase; font-size: 0.8rem; color: #0f172a; margin-bottom: 4px;">Regola Automatica: Superserie (Superset)</div>
                    <span>Inserendo la parola <b>"superset"</b> o <b>"superserie"</b> nella colonna <b>NoteAllenatore</b>, l'app unirà automaticamente il blocco corrente con quello successivo raggruppandoli sotto un unico badge visivo. Le celle che non contengono valori, vanno lasciate semplicemente vuote.</span>
                </div>
            </div>

            <!-- SEZIONE 2: CALCOLATORE DISCHI LIVE -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">⚖️ 2. Calcolatore Dischi Live (Home Gym)</h3>
                <p style="font-size: 0.9rem; line-height: 1.5; margin-bottom: 8px;">
                    Ogni esercizio è equipaggiato con un sistema di calcolo dei dischi integrato direttamente nell'intestazione:
                </p>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151;">
                    <li style="margin-bottom: 6px;"><b>Selettore Bilanciere Rapido:</b> Scegli al volo il tipo di attrezzo usato (es. <i>Bil. 20kg Olimpico, 15kg, 10kg EZ, ecc.</i>).</li>
                    <li style="margin-bottom: 6px;"><b>Aggiornamento in tempo reale:</b> Non appena digiti o modifichi il carico nel <b>Set 1</b>, il box azzurro calcola istantaneamente la scomposizione esatta dei dischi da montare su <i>ciascun lato</i>.</li>
                </ul>
            </div>

            <!-- SEZIONE 3: STORICO E PROGRESSIONE -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">📊 3. Storico, Confronti e Controlli</h3>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151; margin-bottom: 0;">
                    <li style="margin-bottom: 6px;"><b>Scorsa Sessione:</b> Sotto l'intestazione trovi sempre il promemoria di cosa hai sollevato nella sessione precedente.</li>
                    <li style="margin-bottom: 6px;"><b>Indicatori di Scostamento (Testo Rosso):</b> Dalla settimana 2 in poi, se il carico o le ripetizioni inserite si discostano dai parametri originari del CSV, l'app evidenzia il testo in rosso.</li>
                    <li style="margin-bottom: 6px;"><b>Gestione Warm-up:</b> Ogni set dispone della spunta "Escludi da statistiche" per marcare le serie di riscaldamento ed evitarne l'impatto sui calcoli di volume.</li>
                </ul>
            </div>

            <!-- SEZIONE 4: CLOUD SYNC & AUTENTICAZIONE -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">☁️ 4. Sincronizzazione Cloud e Autenticazione</h3>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151; margin-bottom: 0;">
                    <li style="margin-bottom: 6px;"><b>Integrazione Supabase:</b> L'applicazione utilizza Supabase per gestire l'autenticazione sicura e la persistenza dei dati sul cloud.</li>
                    <li style="margin-bottom: 6px;"><b>Salvataggio Automatico:</b> Ogni sessione registrata viene sincronizzata in tempo reale sulla tabella cloud associata al tuo account.</li>
                </ul>
            </div>

            <!-- SEZIONE 5: ANALYTICS E DASHBOARD -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">📈 5. Dashboard Statistiche e Grafici</h3>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151; margin-bottom: 0;">
                    <li style="margin-bottom: 6px;"><b>Grafici:</b> Sezione dedicata all'analisi visiva dei volumi di lavoro, del tonnellaggio totale e dei trend di progressione dei carichi.</li>
                    <li style="margin-bottom: 6px;"><b>Monitoraggio Performance:</b> Visualizzazione chiara dei progressi a medio e lungo termine.</li>
                </ul>
            </div>

            <!-- SEZIONE 6: UTILITY E STRUMENTI EXTRA -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #1d4ed8; margin-top: 0; margin-bottom: 12px;">⏱️ 6. Timer, Export PDF e Gestione Dati</h3>
                <ul style="padding-left: 20px; font-size: 0.9rem; color: #374151; margin-bottom: 0;">
                    <li style="margin-bottom: 6px;"><b>Timer di Recupero Flottante:</b> Widget sempre accessibile per monitorare i tempi di riposo con beep acustici integrati.</li>
                    <li style="margin-bottom: 6px;"><b>Export PDF Giornaliero:</b> Funzionalità per generare un report PDF pulito e strutturato del workout completato.</li>
                    <li style="margin-bottom: 6px;"><b>Strumenti di Reset:</b> Comandi dedicati al reset del singolo mesociclo o al ripristino totale dei dati.</li>
                </ul>
            </div>

        </div>
    `;
}
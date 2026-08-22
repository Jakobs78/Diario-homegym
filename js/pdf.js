// Generazione report PDF
// js/pdf.js
import { state } from './state.js';

export function esportaWorkoutPDF() {
    const nomeAtleta = state.currentUser && state.currentUser.email ? state.currentUser.email.split('@')[0] : "Atleta";
    const dataOra = new Date().toLocaleString('it-IT', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    const weekSelector = document.getElementById('week-selector');
    const weekNumber = weekSelector ? weekSelector.value : '1';
    const mesoDisplay = document.getElementById('meso-display');
    const mesoNumber = mesoDisplay ? mesoDisplay.innerText : '1';
    
    const activeTab = document.querySelector('.tab-btn.active');
    const giornoText = activeTab ? activeTab.innerText : 'Giorno';

    let reportHTML = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Report Allenamento - Mese ${mesoNumber} Sett. ${weekNumber}</title>
            <style>
                @page { margin: 8mm; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    padding: 0; margin: 0; color: #1e293b; line-height: 1.2; font-size: 8.5pt;
                }
                .header { border-bottom: 1.5px solid #0284c7; padding-bottom: 4px; margin-bottom: 8px; }
                .header h1 { margin: 0; font-size: 13pt; color: #0284c7; }
                .meta-info { display: flex; justify-content: space-between; margin-top: 3px; font-size: 8pt; color: #64748b; }
                .exercise-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; margin-bottom: 6px; page-break-inside: avoid; }
                .exercise-title { font-size: 9.5pt; font-weight: bold; color: #0f172a; margin-bottom: 3px; border-left: 3px solid #0284c7; padding-left: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 3px; font-size: 8pt; }
                th, td { border: 1px solid #cbd5e1; padding: 2px 5px; text-align: center; }
                th { background-color: #f8fafc; color: #475569; font-weight: 700; }
                .note-box { background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 3px; padding: 3px 6px; font-size: 8pt; margin-top: 3px; color: #1e40af; }
                .note-title { font-weight: bold; color: #1d4ed8; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Report Allenamento: ${giornoText}</h1>
                <div class="meta-info">
                    <span><strong>Atleta:</strong> ${nomeAtleta}</span>
                    <span><strong>Prog:</strong> Mese ${mesoNumber} - Sett. ${weekNumber}</span>
                    <span><strong>Data:</strong> ${dataOra}</span>
                </div>
            </div>
    `;

    const eserciziCards = document.querySelectorAll('.day-view.active .ex-card');
    if (eserciziCards.length === 0) {
        alert("Nessun esercizio trovato nella vista attiva per generare il report.");
        return;
    }

    eserciziCards.forEach((card) => {
        const nomeExEl = card.querySelector('.ex-name');
        const nomeEx = nomeExEl ? nomeExEl.innerText.trim() : 'Esercizio';
        const righeTable = card.querySelectorAll('.set-table tr');
        let righeHTML = '';

        righeTable.forEach((riga) => {
            if (riga.querySelector('th')) return; 

            const setTd = riga.querySelector('td:first-child');
            let setNum = '-';
            if (setTd) {
                const match = setTd.textContent.match(/\d+/);
                if (match) setNum = match[0];
            }

            const kgInput = riga.querySelector('input[data-id$="-kg"]');
            const repInput = riga.querySelector('input[data-id$="-r"]');
            const rpeInput = riga.querySelector('input[data-id$="-rpe"]');
            const checkInput = riga.querySelector('input[data-id$="-c"]');

            const peso = kgInput ? kgInput.value : '-';
            const reps = repInput ? repInput.value : '-';
            const rpe = rpeInput ? rpeInput.value : '-';
            const isChecked = checkInput && checkInput.checked ? 'OK' : 'NO';

            if (peso !== '' || reps !== '') {
                righeHTML += `
                    <tr>
                        <td>${setNum}</td>
                        <td><strong>${peso || '-'} kg</strong></td>
                        <td>${reps || '-'}</td>
                        <td>${rpe || '-'}</td>
                        <td>${isChecked}</td>
                    </tr>
                `;
            }
        });

        const notaInput = card.querySelector('.notes-input');
        const testoNota = notaInput ? notaInput.value : '';

        reportHTML += `
            <div class="exercise-card">
                <div class="exercise-title">${nomeEx}</div>
                ${righeHTML ? `
                    <table>
                        <thead>
                            <tr><th>SET</th><th>KG</th><th>REPS</th><th>RPE</th><th>STATO</th></tr>
                        </thead>
                        <tbody>${righeHTML}</tbody>
                    </table>
                ` : '<p style="font-size:7.5pt; color:#94a3b8; margin:2px 0;">Nessun dato registrato</p>'}
                
                ${testoNota.trim() ? `
                    <div class="note-box">
                        <span class="note-title">📝 Note:</span> ${testoNota.trim()}
                    </div>
                ` : ''}
            </div>
        `;
    });

    reportHTML += `</body></html>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(reportHTML);
    printWindow.document.close();
    
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}
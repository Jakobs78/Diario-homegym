/* global XLSX */
// ==========================================
// MODULI: importer.js - Generazione template Excel di esempio e parsing di file tabellari (.xlsx, .xls, .csv)
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { parseCoachPDF } from './pdfParser.js';
import { mapPdfTextToWorkoutData } from './pdfTextMapper.js';
import { importWorkoutPlan } from './csvHandler.js';
// ==========================================
// 1. GENERAZIONE E DOWNLOAD TEMPLATE EXCEL
// ==========================================
/**
 * Genera e scarica automaticamente un file Excel (.xlsx) con la struttura corretta
 * inclusi esempi per Drop Set e Triset/Super Set.
 */
export function downloadExcelTemplate() {
    const templateData = [
        ["Settimana", "Giorno", "Esercizio", "Serie", "Reps", "KgMin", "KgMax", "Topset", "RPE", "Note"],
        [1, 1, "Squat", 3, "6", 80, 85, "", "@6.0", "Tecnica impeccabile"],
        [1, 1, "Panca Piana", 4, "5", 65, 70, "", "@7.0", ""],
        
        // Esempio Drop Set (notazione 10+10+10 o nota esplicita)
        [1, 2, "Alzate Laterali (Drop Set)", 3, "10+10+10", 12, 8, "", "@9.5", "3 scalate di carico senza recupero"],
        
        // Esempio Triset / Super Set (esercizi concatenati di seguito)
        [1, 3, "Leg Extension (Triset 1/3)", 3, "12", 40, 45, "", "@8.5", "In triset - Passa subito a Leg Curl"],
        [1, 3, "Leg Curl Sdraiato (Triset 2/3)", 3, "12", 35, 40, "", "@8.5", "In triset - Passa subito a Leg Press"],
        [1, 3, "Leg Press 45° (Triset 3/3)", 3, "15", 120, 140, "", "@9.5", "Fine Triset: Recupero 2'00\""]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Larghezza colonne ottimizzata per la leggibilità
    worksheet['!cols'] = [
        { wch: 12 }, // Settimana
        { wch: 10 }, // Giorno
        { wch: 32 }, // Esercizio (ampliato per notazioni Triset/Drop set)
        { wch: 10 }, // Serie
        { wch: 12 }, // Reps
        { wch: 12 }, // KgMin
        { wch: 12 }, // KgMax
        { wch: 12 }, // Topset
        { wch: 12 }, // RPE
        { wch: 40 }  // Note (ampio per spiegare la sequenza di recupero)
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Scheda_Allenamento");
    
    XLSX.writeFile(workbook, "Modello_Scheda_HomeGym.xlsx");
}

// ==========================================
// 2. PARSING ED ESTRAZIONE FILE EXCEL
// ==========================================
/**
 * Legge direttamente file .xlsx, .xls e .csv convertendoli in testo CSV standard per l'app.
 */
export function parseExcelFile(file, callback) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Seleziona il primo foglio di lavoro disponibile
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Converte le celle trascinate/scritte in CSV pulito
            const csvText = XLSX.utils.sheet_to_csv(worksheet);

            if (!csvText || csvText.trim().length === 0) {
                callback({ success: false, error: "Il file selezionato è vuoto." });
                return;
            }

            callback({ success: true, csvData: csvText });
        } catch (err) {
            console.error("Errore lettura file Excel:", err);
            callback({ success: false, error: "Impossibile leggere il file. Assicurati che sia un file Excel (.xlsx, .xls) o CSV valido." });
        }
    };

    reader.onerror = () => {
        callback({ success: false, error: "Errore durante la lettura del file dal disco." });
    };

    reader.readAsArrayBuffer(file);
}
/**
 * Gestisce l'importazione universale di qualsiasi file (PDF, XLSX, XLS, CSV)
 */
export async function handleUniversalImport(file, statusMsgEl, closeModalCallback) {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (statusMsgEl) {
        statusMsgEl.style.display = 'block';
        statusMsgEl.style.color = 'var(--primary, #007bff)';
    }

    if (ext === 'pdf') {
        if (statusMsgEl) {
            statusMsgEl.style.color = '#d97706';
            statusMsgEl.textContent = "⏳ Analisi e pulizia del PDF del coach in corso...";
        }

        try {
            const pdfData = await parseCoachPDF(file);
            const mappedData = mapPdfTextToWorkoutData(pdfData.cleanedText);
            const preview=(mappedData?.weeks || []).flatMap(week=>
                (week.days || []).flatMap(day=>(day.exercises || []).map(ex=>({
                    week:week.weekNumber,day:day.dayName || day.dayNumber,
                    name:ex.name,sets:ex.setsCount || ex.set || ex.loggedSets?.length || '?',
                    reps:ex.reps || 'da verificare'
                }))));
            if(!preview.length)throw Error('Il PDF non contiene esercizi riconosciuti.');
            const summary='PDF letto: '+mappedData.weeks.length+' settimane, '+
                preview.length+' esercizi.\n\n'+
                preview.slice(0,12).map(x=>'S'+x.week+' '+x.day+': '+x.name+
                    ' · '+x.sets+' serie × '+x.reps+' reps').join('\n')+
                (preview.length>12?'\n… e altri '+(preview.length-12)+' esercizi.':'')+
                '\n\nControlla attentamente la scheda e i recuperi dopo l’importazione. Aggiungere questo mesociclo?';
            if(!window.confirm(summary)){
                if(statusMsgEl)statusMsgEl.textContent='Importazione annullata: lo storico è invariato.';
                return;
            }
            
            const currentYear = new Date().getFullYear().toString();
            if (!state.workoutData.history) state.workoutData.history = {};
            if (!state.workoutData.history.years) state.workoutData.history.years = {};
            if (!state.workoutData.history.years[currentYear]) {
                state.workoutData.history.years[currentYear] = { mesocycles: [] };
            }

            const currentMesos = state.workoutData.history.years[currentYear].mesocycles;
            const extractedMeso = mappedData;

            if (extractedMeso && extractedMeso.weeks && extractedMeso.weeks.length > 0) {
                const nextMesoNumber = currentMesos.length + 1;
                extractedMeso.id = `meso_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                extractedMeso.name = `Mesociclo ${nextMesoNumber}`;
                extractedMeso.importedAt = new Date().toISOString();
                extractedMeso.locked = false;

                currentMesos.push(extractedMeso);
                state.activeMesocycleIndex = currentMesos.length - 1;
                state.activeWeek = 1;
                state.activeDay = 1;

                saveAndSync(state.workoutData);
                renderWorkoutList();

                if (statusMsgEl) {
                    statusMsgEl.style.color = '#16a34a';
                    statusMsgEl.textContent = `✅ Mesociclo ${nextMesoNumber} importato con successo!`;
                }
            } else {
                throw new Error("Impossibile strutturare il mesociclo dal file PDF.");
            }

            setTimeout(() => {
                if (typeof closeModalCallback === 'function') closeModalCallback();
                if (statusMsgEl) statusMsgEl.style.display = 'none';
            }, 2000);

        } catch (err) {
            console.error("Errore parsing PDF:", err);
            if (statusMsgEl) {
                statusMsgEl.style.color = '#dc2626';
                statusMsgEl.textContent = "❌ Errore nella lettura del PDF. Verifica che la connessione sia attiva e che il file sia valido.";
            }
        }
    } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
        if (statusMsgEl) {
            statusMsgEl.style.color = 'var(--primary, #007bff)';
            statusMsgEl.textContent = "⏳ Leggendo il file Tabellare...";
        }

        parseExcelFile(file, (res) => {
            if (!res.success) {
                alert(res.error);
                if (statusMsgEl) statusMsgEl.style.display = 'none';
                return;
            }

            const result = importWorkoutPlan(res.csvData);

            if (result.success) {
                if (typeof closeModalCallback === 'function') closeModalCallback();
                renderWorkoutList();
                alert(result.message || "Scheda importata con successo!");
            } else {
                alert(result.error || "Errore durante l'importazione dei dati.");
            }

            if (statusMsgEl) statusMsgEl.style.display = 'none';
        });
    } else {
        if (statusMsgEl) {
            statusMsgEl.style.color = '#dc2626';
            statusMsgEl.textContent = "❌ Formato non supportato. Usa .xlsx, .xls, .csv o .pdf";
        }
    }
}
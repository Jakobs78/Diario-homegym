// importer.js
/* global XLSX */

/**
 * Genera e scarica automaticamente un file Excel (.xlsx) con la struttura corretta.
 */
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
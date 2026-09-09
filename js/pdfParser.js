// pdfParser.js - Lettore di PDF per schede coach con pulizia testo e note

export async function parseCoachPDF(file) {
    // Verifichiamo se la libreria PDF.js è disponibile globalmente (caricata da CDN in index.html)
    const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;

    if (!pdfjsLib) {
        throw new Error("Libreria PDF.js non trovata. Assicurati di avere la connessione attiva e che lo script sia incluso in index.html.");
    }

    // Impostiamo il worker se necessario
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;

    let fullExtractedText = "";

    // Scorriamo tutte le pagine del PDF
    for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        
        // Estraiamo le stringhe unendo gli elementi di testo
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullExtractedText += `\n--- PAGINA ${i} ---\n` + pageText;
    }

    // Pulizia delle note e dei caratteri appiccicati tipici delle esportazioni PDF da Excel
    const cleanedText = cleanCoachText(fullExtractedText);

    console.log("PDF estratto e pulito con successo:", cleanedText.substring(0, 200) + "...");
    
    return {
        rawText: fullExtractedText,
        cleanedText: cleanedText,
        pagesCount: pdfDocument.numPages
    };
}

// Funzione helper per ripulire le parole fuse e i caratteri sporchi del PDF
function cleanCoachText(text) {
    return text
        // Rimuove spazi multipli eccessivi
        .replace(/\s+/g, ' ')
        // Sistema parole tipicamente sballate o appiccicate nelle note dei coach
        .replace(/FROLL/gi, 'FOCUS SUL')
        .replace(/ESEMOZIO/gi, 'ESERCIZIO')
        .replace(/SERENEROONI/gi, 'SERIE / REPS')
        .replace(/CRIFICE MAX/gi, 'CARICO MAX')
        .replace(/CRRICO/gi, 'CARICO')
        .replace(/VTORIET/gi, 'V-TARGET')
        .replace(/VLEFFETTINO/gi, 'EFFETTO')
        .trim();
}
/* global pdfjsLib */
// ==========================================
// MODULI: pdfParser.js - Lettore di PDF per schede coach con ricostruzione layout spaziale Y e pulizia testo
// ==========================================

export async function parseCoachPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Raggruppa gli elementi di testo per coordinata Y (altezza riga)
        const linesMap = {};
        
        textContent.items.forEach(item => {
            if (!item.str.trim()) return;
            // Arrotondiamo Y per unificare elementi sulla stessa riga
            const y = Math.round(item.transform[5]); 
            if (!linesMap[y]) linesMap[y] = [];
            linesMap[y].push({ x: item.transform[4], text: item.str });
        });

        // Ordina le righe dall'alto verso il basso (Y decrescente)
        const sortedY = Object.keys(linesMap).sort((a, b) => b - a);

        let pageText = `--- PAGINA ${i} ---\n`;
        sortedY.forEach(y => {
            // Ordina le parole nella riga da sinistra a destra (X crescente)
            const lineItems = linesMap[y].sort((a, b) => a.x - b.x);
            const lineString = lineItems.map(item => item.text).join(' ');
            pageText += lineString + '\n';
        });

        fullText += pageText + '\n';
    }

    // Ritorna l'oggetto che main.js si aspetta
    return {
        cleanedText: fullText,
        pagesCount: pdf.numPages
    };
}

// Funzione helper per ripulire le parole fuse e i caratteri sporchi del PDF
export function cleanCoachText(text) {
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
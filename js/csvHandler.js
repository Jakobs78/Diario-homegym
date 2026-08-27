// csvHandler.js
export function exportToCSV(workoutData) {
    if (!workoutData || workoutData.length === 0) {
        alert("Nessun dato da esportare.");
        return;
    }
    
    // Genera l'intestazione dinamicamente basata sulle chiavi del primo oggetto
    const headers = Object.keys(workoutData[0]).join(',');
    
    // Genera le righe
    const rows = workoutData.map(row => {
        return Object.values(row).map(value => {
            // Se il valore contiene virgole, lo mettiamo tra virgolette doppie
            if (typeof value === 'string' && value.includes(',')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    // Assegna il nome del file con la data odierna
    link.setAttribute("download", `workout_data_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function parseCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const text = event.target.result;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length < 2) {
                reject("File CSV vuoto o formato non valido.");
                return;
            }
            
            const headers = lines[0].split(',').map(h => h.trim());
            const data = [];
            
            for (let i = 1; i < lines.length; i++) {
                // Regex semplice per separare la virgola (ignorando casi troppo complessi per questa webapp)
                const currentline = lines[i].split(',');
                let obj = {};
                for (let j = 0; j < headers.length; j++) {
                    obj[headers[j]] = currentline[j] ? currentline[j].trim() : '';
                }
                data.push(obj);
            }
            resolve(data);
        };
        
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}
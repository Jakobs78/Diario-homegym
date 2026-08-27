// pdfExport.js
import { state } from './state.js';

export function generatePDFReport() {
    if (!state.workoutData || state.workoutData.length === 0) {
        alert("Nessun dato disponibile per generare il PDF.");
        return;
    }

    // Istanza di jsPDF (deve essere importata via CDN in index.html)
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Report Allenamenti - Advanced Workout Tracker", 10, 20);
    
    doc.setFontSize(12);
    let yPos = 35;

    // Logica di base per stampare le sessioni (personalizzabile a seconda della tua struttura dati)
    const recentWorkouts = state.workoutData.slice(-15); // Prende gli ultimi 15 per evitare file enormi
    
    recentWorkouts.forEach((workout, index) => {
        // Gestione cambio pagina se si arriva in fondo
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }
        
        // Struttura della riga. Adatta queste chiavi (date, exercise, etc.) alla tua struttura esatta
        const lineText = `${index + 1}. Data: ${workout.date || 'N/D'} | Esercizio: ${workout.exercise || 'N/D'} | Set: ${workout.sets || '-'}x${workout.reps || '-'} @ ${workout.weight || '-'}kg`;
        
        doc.text(lineText, 10, yPos);
        yPos += 10;
    });

    // Salva il file con la data corrente
    doc.save(`workout_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
# HomeGym Diary 1.3.6 — recupero iPhone con Comandi Rapidi

Il timer web resta disponibile su ogni dispositivo e browser, con gli stessi comandi, audio e ripristino della scadenza. Su iPhone/iPad viene aggiunto un collegamento facoltativo «Avvia su iPhone» che richiama il comando «Recupero palestra» passando i secondi rimanenti al momento del tocco. Non cambia la scadenza della webapp e non parte automaticamente alla conferma di una serie.

Il comando va creato sul telefono: Input comando rapido → Ottieni numeri dall’input → Avvia timer usando il numero ricevuto e l’unità secondi. «Configura» apre le istruzioni nel manuale esistente, senza interrompere il timer web. Il collegamento usa lo schema URL ufficiale di Comandi Rapidi, con nome e durata codificati, e richiede un tocco dell’utente.

Il browser non può confermare che il comando esista o che Orologio sia partito: l’interfaccia segnala una richiesta e invita alla verifica sul telefono. I timer sono indipendenti: +30, −15 e × agiscono soltanto sulla webapp; Orologio va modificato o annullato separatamente. Richiamare di nuovo il comando può creare un altro timer. Una modifica della scadenza web dopo una richiesta mostra un avviso specifico. Non vengono emessi comandi automatici di aggiornamento o cancellazione verso Orologio.

Nessuna dipendenza aggiunta, nessun server push o abbonamento richiesto. Nessun cambiamento a diario, account, sincronizzazione o MyCoatch. Su Android e computer i controlli iPhone rimangono nascosti. La guida resta in un’unica pagina.

Versione 1.3.6-20261104, cache PWA v88. Verifiche con dati sintetici: URL e durata, riconoscimento dei dispositivi, assenza di avvio automatico, scadenza web invariata al richiamo, +30/−15/×, istruzioni durante il recupero e layout a 320 px. Nelle prove browser il collegamento nativo viene intercettato senza aprire applicazioni esterne: l’avvio reale in Orologio richiede conferma su iPhone con il comando configurato.

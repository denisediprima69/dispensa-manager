# Lo Stipo

App per tenere sotto controllo la dispensa di casa ("lo Stipo": frigo, freezer, dispensa, cantina): foto del prodotto, riconoscimento automatico della data di scadenza (OCR), notifica una settimana prima della scadenza. Obiettivo: ridurre lo spreco alimentare.

Mascotte prevista: **Lo Stipino**, una nuvoletta di polvere doodle — asset grafico da integrare quando pronto.

## Stato del progetto

Costruita come **web app / PWA**: un solo codice funziona sia su iOS che su Android via browser, installabile sulla home del telefono senza passare dagli store.

### Schermate

- [x] `index.html` — Home: benvenuto, tutorial in 3 step, sezione "Da salvare oggi", statistiche reali (salvati, questa settimana, % salvato)
- [x] `aggiungi-prodotto.html` — Scatta foto → OCR automatico della data → conferma esplicita "È corretta?" → inserimento manuale come fallback
- [x] `lista-dispensa.html` — Lista prodotti raggruppata per zona, modifica prodotto, modale Consumato/Buttato con gestione quantità
- [x] `lista-spesa.html` — Aggiungi articoli, spunta quando comprati, collegata allo Stipo (banner "Aggiungi allo Stipo" con nome precompilato)
- [x] `impostazioni.html` — Categorie, preferenze notifiche (UI pronta, motore di invio da collegare), info app, privacy

### Funzionalità trasversali

- [x] Categorie semplificate con emoji (Latticini, Carne, Pesce, Frutta e verdura, Dispensa, Uova, Surgelati, Bevande, Altro) + categorie personalizzate create dall'utente, condivise in tutta l'app
- [x] Quantità con consumo parziale, distinzione Consumato ✅ / Buttato 🗑️, log eventi (`dispensa-eventi`) alla base delle statistiche in home
- [x] Modifica prodotto (nome, categoria, quantità, data, zona) con eliminazione separata dal flusso consumo/spreco
- [x] Scansione barcode in **due passaggi separati** (barcode facoltativo → data di scadenza): risolve il problema reale per cui barcode e scadenza sono spesso su lati opposti della confezione. Riconoscimento barcode tramite ZXing + ricerca automatica nome prodotto su Open Food Facts. Banner suggerimento disattivabile in modo permanente (riattivabile da Impostazioni)

### Ancora da fare (V1)

- [ ] Foto conservata sul prodotto (miniatura visibile nella card) — volutamente lasciata per ultima
- [ ] Motore di invio notifiche push vero (richiede backend + service worker)

## Stack tecnico

- HTML/CSS/JS vanilla (nessun framework, per ora — semplice da mantenere in fase di prototipo)
- [Tesseract.js](https://github.com/naptha/tesseract.js) per l'OCR delle date di scadenza (gira nel browser, gratis, nessuna chiamata server)
- Storage persistente lato client per salvare prodotti, lista spesa, categorie personalizzate, preferenze e log eventi

## Come si lavora

- **Design/UI**: asset grafici (palette, font, icone, mascotte Lo Stipino) vengono integrati man mano che sono pronti, senza toccare la logica funzionale
- **Sviluppo**: ogni nuova schermata viene aggiunta come file HTML separato nella root del progetto, con lo stesso sistema di variabili CSS (vedi `:root` in cima a ogni file) per restare coerenti

## Prossimi step (V2, non ancora in scope)

1. Foto prodotto conservata (miniatura compressa)
2. Notifiche push reali con orario preferito e aggregazione (niente spam di più avvisi separati)
3. Distinzione "Scade il" vs "Da consumarsi preferibilmente entro"
4. Statistiche estese / storico
5. "Cosa posso cucinare?" con i prodotti in scadenza

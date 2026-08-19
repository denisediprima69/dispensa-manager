# Lo Stipo

App per tenere sotto controllo la dispensa di casa ("lo Stipo": frigo, freezer, dispensa, cantina): foto del prodotto, riconoscimento automatico della data di scadenza (OCR), notifica una settimana prima della scadenza. Obiettivo: ridurre lo spreco alimentare.

Mascotte prevista: **Lo Stipino**, una nuvoletta di polvere doodle — asset grafico da integrare quando pronto.

## Stato del progetto

Costruita come **web app / PWA**: un solo codice funziona sia su iOS che su Android via browser, installabile sulla home del telefono senza passare dagli store.

### Schermate

- [x] `index.html` — Home page: benvenuto, tutorial in 3 step, messaggio anti-spreco con contatore prodotti salvati
- [x] `aggiungi-prodotto.html` — Scatta foto → OCR automatico della data → conferma
- [x] `lista-dispensa.html` — Lista prodotti raggruppata per zona (Frigo/Freezer/Dispensa/Cantina), ordinata per urgenza
- [x] Lista della spesa (`lista-spesa.html`) — aggiungi articoli, spunta quando comprati, svuota il carrello

## Stack tecnico

- HTML/CSS/JS vanilla (nessun framework, per ora — semplice da mantenere in fase di prototipo)
- [Tesseract.js](https://github.com/naptha/tesseract.js) per l'OCR delle date di scadenza (gira nel browser, gratis, nessuna chiamata server)
- Storage persistente lato client per salvare i prodotti

## Come si lavora

- **Design/UI**: asset grafici (palette, font, icone) vengono integrati man mano che sono pronti, senza toccare la logica funzionale
- **Sviluppo**: ogni nuova schermata viene aggiunta come file HTML separato nella root del progetto, con lo stesso sistema di variabili CSS (vedi `:root` in cima a ogni file) per restare coerenti

## Prossimi step

1. Home page con onboarding
2. Notifiche push per scadenze imminenti (richiede service worker)
3. Lista della spesa collegata alla dispensa
4. Manifest PWA (icona, nome app, installabilità)

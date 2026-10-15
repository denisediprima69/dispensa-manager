// Lettura data di scadenza: parsing testo OCR + scansione live con fotocamera (Tesseract).
(function () {
  const MONTHS = { GEN:1, JAN:1, FEB:2, MAR:3, APR:4, MAG:5, MAY:5, GIU:6, JUN:6, LUG:7, JUL:7, AGO:8, AUG:8, SET:9, SEP:9, OTT:10, OCT:10, NOV:11, DIC:12, DEC:12 };

  function pad(n) { return String(n).padStart(2, '0'); }
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  function iso(y, m, d) {
    y = +y; m = +m; d = +d;
    if (m < 1 || m > 12 || d < 1 || d > lastDay(y, m)) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function plausible(s) {
    const date = new Date(s), now = new Date();
    return date >= new Date(now.getTime() - 60 * 864e5) && date <= new Date(now.getFullYear() + 6, 0, 1);
  }
  const fullYear = (y) => (String(y).length === 2 ? 2000 + +y : +y);

  function parse(text) {
    const t = String(text || '').toUpperCase().replace(/[|]/g, '1').replace(/O(?=\d)|(?<=\d)O/g, '0');
    const found = [];
    const add = (v) => { if (v && plausible(v)) found.push(v); };
    let m, re;

    re = /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/g;
    while ((m = re.exec(t))) add(iso(fullYear(m[3]), m[2], m[1]));

    re = /\b(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\b/g;
    while ((m = re.exec(t))) add(iso(m[1], m[2], m[3]));

    // giorno opzionale + mese testuale + anno: 15 DIC 2026, DIC 26, 15DIC26
    re = /\b(\d{1,2})?\s*(GEN|JAN|FEB|MAR|APR|MAG|MAY|GIU|JUN|LUG|JUL|AGO|AUG|SET|SEP|OTT|OCT|NOV|DIC|DEC)[A-Z]*\.?\s*[\/\-.]?\s*(\d{4}|\d{2})\b/g;
    while ((m = re.exec(t))) {
      const mo = MONTHS[m[2]], y = fullYear(m[3]);
      add(iso(y, mo, m[1] ? +m[1] : lastDay(y, mo)));
    }

    // mese/anno: 12/2026, 12.26 (a fine mese)
    re = /(^|[^\d\/\-.])(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?![\d\/\-.]\d)/g;
    while ((m = re.exec(t))) {
      const mo = +m[2], y = fullYear(m[3]);
      if (mo >= 1 && mo <= 12 && y >= 2020) add(iso(y, mo, lastDay(y, mo)));
    }
    // OCR a puntini: separatori persi o scambiati ("06 2027", "062027", "06_2027")
    if (!found.length) {
      t.split(/\n+/).forEach((line) => {
        const digits = line.replace(/\D/g, '');
        let mm;
        if ((mm = /(0[1-9]|1[0-2])(20[2-3]\d)/.exec(digits)) && digits.length <= 10) {
          const y = +mm[2], mo = +mm[1]; add(iso(y, mo, lastDay(y, mo)));
        }
        if ((mm = /(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20[2-3]\d)/.exec(digits))) add(iso(mm[3], mm[2], mm[1]));
      });
    }
    return [...new Set(found)].sort();
  }

  // Cifre digitate a mano: 151226, 15122026, 1226 (mese/anno)
  function parseDigits(str) {
    const d = String(str || '').replace(/\D/g, '');
    let r = null;
    if (d.length === 8) r = iso(d.slice(4), d.slice(2, 4), d.slice(0, 2));
    else if (d.length === 6) r = iso(2000 + +d.slice(4), d.slice(2, 4), d.slice(0, 2));
    if (!r && d.length === 6) { const mo = +d.slice(0, 2), y = +d.slice(2); if (y >= 2020 && y < 2100) r = iso(y, mo, lastDay(y, mo)); }
    if (!r && d.length === 4) { const mo = +d.slice(0, 2), y = 2000 + +d.slice(2); r = iso(y, mo, lastDay(y, mo)); }
    return r;
  }

  function addDays(days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // opts: { video, onStatus, onError, onFound(isoDates, snapshotDataUrl) } -> stop()
  function startDateScan(opts) {
    const VERSION = 'v6';
    const video = opts.video, rawStatus = opts.onStatus || function () {};
    const status = (m) => rawStatus('[' + VERSION + '] ' + m);
    let stopped = false, stream = null, worker = null, timer = null;
    const recent = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('lettura troppo lenta')), ms))]);

    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      try { video.srcObject = null; } catch (e) {}
      if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
    }
    function fail(msg) { stop(); opts.onError && opts.onError(msg); }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fail('Questo browser non permette l\'uso della fotocamera (serve HTTPS).');
      return stop;
    }
    if (typeof Tesseract === 'undefined') { fail('Lettore testo non disponibile.'); return stop; }

    // Pre-elaborazione pensata per date stampate a getto d'inchiostro / a puntini:
    // soglia adattiva locale + ispessimento per unire i puntini.
    function grab() {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      const sw = Math.round(w * 0.9), sh = Math.round(h * 0.3);
      const sx = Math.round((w - sw) / 2), sy = Math.round((h - sh) / 2);
      const scale = Math.min(1.5, 1000 / sw);
      const W = Math.round(sw * scale), H = Math.round(sh * scale);
      canvas.width = W; canvas.height = H;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      const snap = canvas.toDataURL('image/jpeg', 0.7);

      const img = ctx.getImageData(0, 0, W, H), p = img.data;
      const g = new Float32Array(W * H);
      for (let i = 0, j = 0; i < p.length; i += 4, j++) g[j] = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;

      // media locale con immagine integrale
      const R = 18, I = new Float64Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) {
        let row = 0;
        for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
      }
      const dark = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
        for (let x = 0; x < W; x++) {
          const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
          const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
          const mean = sum / ((x1 - x0) * (y1 - y0));
          dark[y * W + x] = g[y * W + x] < mean - 14 ? 1 : 0;
        }
      }
      // ispessimento (dilatazione 5x5 separabile) per unire i puntini
      const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H), D = 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0; for (let k = -D; k <= D && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W && dark[y * W + xx]) v = 1; }
        tmp[y * W + x] = v;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0; for (let k = -D; k <= D && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1; }
        out[y * W + x] = v;
      }
      for (let j = 0, i = 0; j < out.length; j++, i += 4) { const v = out[j] ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      if (opts.onDebug) opts.onDebug(canvas.toDataURL('image/png'));
      return snap;
    }

    status('Richiesta accesso alla fotocamera…');
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(async (s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = s;
      try { await video.play(); } catch (e) { fail('La fotocamera non parte (' + (e.name || 'play') + ').'); return; }

      // niente zoom, messa a fuoco continua (dove supportato)
      try {
        const track = s.getVideoTracks()[0], caps = track.getCapabilities ? track.getCapabilities() : {};
        const adv = {};
        if (caps.zoom) adv.zoom = caps.zoom.min;
        if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) adv.focusMode = 'continuous';
        if (Object.keys(adv).length) await track.applyConstraints({ advanced: [adv] });
      } catch (e) { /* non supportato */ }
      if (opts.onVideoReady) opts.onVideoReady(video.videoWidth, video.videoHeight);

      status('Preparo il lettore della data…');
      try {
        worker = await Promise.race([Tesseract.createWorker('eng'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout caricamento (rete lenta o bloccata)')), 25000))]);
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789/.-: ',
          tessedit_pageseg_mode: '6'
        });
      } catch (e) { fail('Non riesco a caricare il lettore (' + (e && e.message ? e.message : 'errore') + ').'); return; }
      if (stopped) { stop(); return; }
      status('Inquadra la data stampata, tieni fermo il telefono');

      const startedAt = Date.now();
      const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      stop.readNow = async () => {
        if (stopped || !worker) return;
        if (timer) clearTimeout(timer);
        status('Leggo…');
        try {
          const snap = grab();
          const { data } = await withTimeout(worker.recognize(canvas), 10000);
          const dates = parse(data.text);
          if (dates.length) { stop(); opts.onFound(dates, snap); return; }
          status('Nessuna data letta' + (clean(data.text) ? ' (vedo: «' + clean(data.text) + '»)' : '') + ' — avvicinati un po\' o cambia luce');
        } catch (e) { status('Lettura non riuscita, riprova'); }
        timer = setTimeout(loop, 600);
      };

      const loop = async () => {
        if (stopped) return;
        try {
          const snap = grab();
          if (snap) {
            const { data } = await withTimeout(worker.recognize(canvas), 10000);
            const dates = parse(data.text);
            if (!dates.length) {
              const slow = Date.now() - startedAt > 12000;
              status(slow ? 'Non riesco a leggerla: usa “Preferisco scriverla io” e digita es. 0627' : (clean(data.text) ? 'Sto leggendo: «' + clean(data.text) + '»' : 'Inquadra la data dentro il riquadro'));
            }
            recent.push(dates); if (recent.length > 4) recent.shift();
            // conferma: la stessa data letta in almeno 2 fotogrammi recenti
            const count = {};
            recent.forEach((arr) => arr.forEach((d) => { count[d] = (count[d] || 0) + 1; }));
            const stable = Object.keys(count).filter((d) => count[d] >= 2);
            if (stable.length) {
              const all = [...new Set([...stable, ...recent.flat()])];
              stop();
              opts.onFound(all, snap);
              return;
            }
          }
        } catch (e) { status('Errore lettura: ' + (e && e.message ? e.message : e)); }
        timer = setTimeout(loop, 500);
      };
      loop();
    }).catch((err) => fail('Non riesco ad accedere alla fotocamera (' + (err && err.name ? err.name : 'errore') + ').'));

    return stop;
  }

  window.DateReader = { parse, parseDigits, addDays, startDateScan };
})();

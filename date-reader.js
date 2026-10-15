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
    return [...new Set(found)].sort();
  }

  // Cifre digitate a mano: 151226, 15122026, 1226 (mese/anno)
  function parseDigits(str) {
    const d = String(str || '').replace(/\D/g, '');
    let r = null;
    if (d.length === 8) r = iso(d.slice(4), d.slice(2, 4), d.slice(0, 2));
    else if (d.length === 6) r = iso(2000 + +d.slice(4), d.slice(2, 4), d.slice(0, 2));
    else if (d.length === 4) { const mo = +d.slice(0, 2), y = 2000 + +d.slice(2); r = iso(y, mo, lastDay(y, mo)); }
    return r;
  }

  function addDays(days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // opts: { video, onStatus, onError, onFound(isoDates, snapshotDataUrl) } -> stop()
  function startDateScan(opts) {
    const video = opts.video, status = opts.onStatus || function () {};
    let stopped = false, stream = null, worker = null, timer = null;
    const recent = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

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

    function grab() {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      const sw = Math.round(w * 0.9), sh = Math.round(h * 0.5);
      const sx = Math.round((w - sw) / 2), sy = Math.round((h - sh) / 2);
      const scale = Math.min(2, 1400 / sw);
      canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const snap = canvas.toDataURL('image/jpeg', 0.7);
      // scala di grigi + contrasto
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height), p = img.data;
      let lo = 255, hi = 0;
      for (let i = 0; i < p.length; i += 4) {
        const g = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) | 0;
        p[i] = p[i + 1] = p[i + 2] = g; if (g < lo) lo = g; if (g > hi) hi = g;
      }
      const range = Math.max(40, hi - lo);
      for (let i = 0; i < p.length; i += 4) {
        const v = Math.max(0, Math.min(255, ((p[i] - lo) * 255) / range));
        p[i] = p[i + 1] = p[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
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
        worker = await Tesseract.createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789/.-: ABCDEFGHIJLMNOPRSTUVZ',
          tessedit_pageseg_mode: '11'
        });
      } catch (e) { fail('Non riesco a caricare il lettore (' + (e && e.message ? e.message : 'errore') + ').'); return; }
      if (stopped) { stop(); return; }
      status('Inquadra la data stampata, tieni fermo il telefono');

      const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      stop.readNow = async () => {
        if (stopped || !worker) return;
        if (timer) clearTimeout(timer);
        status('Leggo…');
        try {
          const snap = grab();
          const { data } = await worker.recognize(canvas);
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
            const { data } = await worker.recognize(canvas);
            const dates = parse(data.text);
            if (!dates.length && clean(data.text)) status('Sto leggendo: «' + clean(data.text) + '»');
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
        } catch (e) { /* fotogramma non leggibile */ }
        timer = setTimeout(loop, 300);
      };
      loop();
    }).catch((err) => fail('Non riesco ad accedere alla fotocamera (' + (err && err.name ? err.name : 'errore') + ').'));

    return stop;
  }

  window.DateReader = { parse, parseDigits, addDays, startDateScan };
})();

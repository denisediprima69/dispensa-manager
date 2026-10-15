// Scansione barcode live condivisa. Usa BarcodeDetector nativo (Chrome/Android) se c'è, altrimenti ZXing.
// startBarcodeScan({ video, onResult(text), onStatus(msg), onError(msg) }) -> stop()
(function () {
  window.startBarcodeScan = function (opts) {
    const video = opts.video;
    let stopped = false, stream = null, timer = null, lastText = '', lastTime = 0;
    const status = opts.onStatus || function () {};

    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      try { video.srcObject = null; } catch (e) {}
    }

    function fail(msg) { stop(); opts.onError && opts.onError(msg); }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fail('Questo browser non permette l\'uso della fotocamera (serve HTTPS).');
      return stop;
    }

    let detect;
    const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function prepareDetector() {
      if ('BarcodeDetector' in window) {
        try {
          const d = new BarcodeDetector({ formats: FORMATS });
          detect = async () => {
            const codes = await d.detect(video);
            return codes.length ? codes[0].rawValue : null;
          };
          return 'nativo';
        } catch (e) { /* passa a ZXing */ }
      }
      if (typeof ZXing !== 'undefined' && ZXing.MultiFormatReader) {
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128
        ]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const reader = new ZXing.MultiFormatReader();
        reader.setHints(hints);
        detect = async () => {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w || !h) return null;
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          try {
            const src = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
            const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
            return reader.decode(bmp).getText();
          } catch (e) { return null; }
        };
        return 'ZXing';
      }
      return null;
    }

    status('Richiesta accesso alla fotocamera…');
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(async (s) => {
      if (stopped) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = s;
      try { await video.play(); } catch (e) { fail('La fotocamera non parte (' + (e.name || 'play') + ').'); return; }

      const engine = prepareDetector();
      if (!engine) { fail('Lettore barcode non disponibile. Usa la foto.'); return; }
      status('Fotocamera attiva (' + video.videoWidth + '×' + video.videoHeight + ', ' + engine + ') — inquadra il barcode');

      const loop = async () => {
        if (stopped) return;
        try {
          const text = await detect();
          if (text && text.length >= 6) {
            if (opts.continuous) {
              // modalità cassa: non si ferma, ignora lo stesso codice per 1,8 s
              const now = Date.now();
              if (!(lastText === text && now - lastTime < 1800)) opts.onResult(text);
              lastText = text; lastTime = now;
              timer = setTimeout(loop, 150);
              return;
            }
            stop();
            opts.onResult(text);
            return;
          }
        } catch (e) { /* frame non leggibile */ }
        timer = setTimeout(loop, 200);
      };
      loop();
    }).catch((err) => {
      fail('Non riesco ad accedere alla fotocamera (' + (err && err.name ? err.name : 'errore') + ').');
    });

    return stop;
  };
})();

// Regole condivise: da barcode a nome + categoria + dove metterlo, memoria dei prodotti già visti, bip.
(function () {
  const KNOWN_KEY = 'prodotti-noti';

  function inferFromOFF(p) {
    p = p || {};
    const tags = ((p.categories_tags || []).join(' ') + ' ' + (p.categories || '')).toLowerCase();
    const cond = String(p.conservation_conditions_it || p.conservation_conditions || '').toLowerCase();
    const has = (re) => re.test(tags);
    let category = 'altro', location = 'dispensa';

    if (has(/frozen|surgelat|congelat|ice-cream|gelat/)) { category = 'surgelati'; location = 'freezer'; }
    else if (has(/canned|tinned|conserv|preserve/)) { category = 'dispensa_secca'; location = 'dispensa'; }
    else if (has(/en:eggs\b|uova/)) { category = 'uova'; location = 'frigo'; }
    else if (has(/en:meats|charcuter|en:hams|salum|prosciutt|sausage|en:poultr/)) { category = 'carne'; location = 'frigo'; }
    else if (has(/en:fishes|en:seafood|en:fish-|pesce/)) { category = 'pesce'; location = 'frigo'; }
    else if (has(/en:dairies|en:milks|en:yogurts|en:cheeses|en:fermented-milk|en:butters|en:creams|latticin|formagg|yogurt/)) {
      category = 'latticini';
      location = has(/\buht\b|long-life|lunga-conservazione|en:milks/) && !/frigo|refriger|réfrig|fridge/.test(cond) ? 'dispensa' : 'frigo';
      if (has(/en:yogurts|en:cheeses|en:butters|fermented/)) location = 'frigo';
    }
    else if (has(/en:fresh-(fruits|vegetables)|en:fruits-and-vegetables|en:vegetables|en:fruits/)) { category = 'frutta_verdura'; location = 'frigo'; }
    else if (has(/en:beverages|en:waters|en:sodas|en:juices|en:beers|en:wines|en:drinks|bevand/)) { category = 'bevande'; location = has(/en:wines|en:beers/) ? 'cantina' : 'dispensa'; }
    else if (has(/en:cereals|en:pastas|en:rices|en:biscuits|en:snacks|en:spreads|en:sweeteners|en:sauces|en:condiments|en:breads|en:flours|en:sugars|en:oils|en:chocolates|en:coffees|en:teas|en:legumes|en:nuts|en:plant-based|en:groceries|en:breakfast/)) { category = 'dispensa_secca'; location = 'dispensa'; }

    // indicazioni in etichetta (ignorando "dopo l'apertura")
    if (cond && !/apertura|opening|ouverture|aperto|aprire/.test(cond) && location === 'dispensa' && category !== 'surgelati') {
      if (/frigo|refriger|réfrig|fridge|\+\s*[1-8]\s*°|0\s*°\s*c?\s*[-–a]\s*\+?\s*[4-8]/.test(cond)) location = 'frigo';
    }
    return { category, location };
  }

  async function loadKnown() {
    try { const r = await window.storage.get(KNOWN_KEY, false); return r ? JSON.parse(r.value) : {}; } catch (e) { return {}; }
  }
  async function saveKnown(map) {
    try { await window.storage.set(KNOWN_KEY, JSON.stringify(map), false); } catch (e) {}
  }
  async function remember(code, info) {
    if (!code) return;
    const map = await loadKnown();
    map[code] = { name: info.name, category: info.category, location: info.location, src: info.src || 'user' };
    await saveKnown(map);
  }

  // -> { name, category, location, source: 'memoria' | 'openfoodfacts' | 'sconosciuto' }
  async function lookup(code) {
    const known = await loadKnown();
    if (known[code]) return Object.assign({ source: 'memoria' }, known[code]);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 7000);
      const url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) +
        '.json?fields=product_name,product_name_it,brands,categories,categories_tags,conservation_conditions,conservation_conditions_it';
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const pr = data.product;
        const name = (pr.product_name_it || pr.product_name || '').trim() || String(pr.brands || '').split(',')[0].trim();
        const rules = inferFromOFF(pr);
        if (name) {
          const out = { name, category: rules.category, location: rules.location };
          remember(code, Object.assign({ src: 'off' }, out));
          return Object.assign({ source: 'openfoodfacts' }, out);
        }
        return { name: '', category: rules.category, location: rules.location, source: 'sconosciuto' };
      }
    } catch (e) { /* rete assente o timeout */ }
    return { name: '', category: 'altro', location: 'dispensa', source: 'sconosciuto' };
  }

  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 1750;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.13);
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
  }

  const LOCATION_LABEL = { frigo: 'Frigo', freezer: 'Freezer', dispensa: 'Dispensa', cantina: 'Cantina' };
  const LOCATION_ICON = { frigo: '❄️', freezer: '🧊', dispensa: '🥫', cantina: '🍷' };

  window.ProductRules = { inferFromOFF, lookup, remember, beep, LOCATION_LABEL, LOCATION_ICON };
})();

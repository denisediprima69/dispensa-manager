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
    const prev = map[code] || {};
    map[code] = { name: info.name, category: info.category, location: info.location, src: info.src || prev.src || 'user',
      weight: info.weight != null ? info.weight : (prev.weight || ''), diet: info.diet || prev.diet || null };
    await saveKnown(map);
  }

  // -> { name, category, location, source: 'memoria' | 'openfoodfacts' | 'sconosciuto' }
  async function lookup(code) {
    const known = await loadKnown();
    // prodotti presi da Open Food Facts prima dell'arrivo di peso/dieta: li riscarico una volta
    const k = known[code];
    const complete = k && (k.src !== 'off' || (k.diet && k.weight !== undefined));
    if (complete) return Object.assign({ source: 'memoria' }, k);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 7000);
      const url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) +
        '.json?fields=product_name,product_name_it,brands,categories,categories_tags,conservation_conditions,conservation_conditions_it,quantity,product_quantity,product_quantity_unit,allergens_tags,traces_tags,labels_tags,ingredients_text,ingredients_text_it';
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const pr = data.product;
        const name = (pr.product_name_it || pr.product_name || '').trim() || String(pr.brands || '').split(',')[0].trim();
        const rules = inferFromOFF(pr);
        if (name) {
          const out = { name, category: rules.category, location: rules.location, weight: weightFromOFF(pr), diet: dietFromOFF(pr) };
          remember(code, Object.assign({ src: 'off' }, out));
          return Object.assign({ source: 'openfoodfacts' }, out);
        }
        return { name: '', category: rules.category, location: rules.location, weight: weightFromOFF(pr), diet: dietFromOFF(pr), source: 'sconosciuto' };
      }
    } catch (e) { /* rete assente o timeout */ }
    if (k) return Object.assign({ source: 'memoria' }, k);
    return { name: '', category: 'altro', location: 'dispensa', weight: '', diet: null, source: 'sconosciuto' };
  }


  // ---------- peso ----------
  function weightFromOFF(p) {
    p = p || {};
    let w = String(p.quantity || '').trim();
    if (!w && p.product_quantity) w = p.product_quantity + ' ' + (p.product_quantity_unit || 'g');
    return w.replace(/\s+/g, ' ').slice(0, 24);
  }

  // ---------- celiachia / lattosio ----------
  // valori: 'si' (contiene) | 'tracce' | 'no' (ok) | 'nd' (dato non disponibile)
  function dietFromOFF(p) {
    p = p || {};
    const all = (p.allergens_tags || []).join(' ').toLowerCase();
    const tr = (p.traces_tags || []).join(' ').toLowerCase();
    const lb = (p.labels_tags || []).join(' ').toLowerCase();
    const cat = (p.categories_tags || []).join(' ').toLowerCase();
    const ing = String(p.ingredients_text_it || p.ingredients_text || '').toLowerCase();
    const hasData = !!(all || ing);

    let gluten = 'nd';
    if (/en:gluten\b/.test(all) || /\b(frumento|grano|orzo|segale|farro|kamut|semola|glutine|wheat|barley|rye|spelt)\b/.test(ing)) gluten = 'si';
    else if (/en:gluten-free|en:no-gluten|en:without-gluten|senza-glutine/.test(lb)) gluten = 'no';
    else if (/en:gluten\b/.test(tr)) gluten = 'tracce';
    else if (hasData) gluten = 'no';
    if (gluten === 'si' && /en:gluten-free|en:no-gluten|en:without-gluten|senza-glutine/.test(lb)) gluten = 'no';

    let lattosio = 'nd';
    const lactoseFree = /en:no-lactose|en:lactose-free|en:without-lactose|senza-lattosio/.test(lb);
    if (lactoseFree) lattosio = 'no';
    else if (/en:milk\b/.test(all) || /\b(latte|lattosio|siero|caseina|burro|panna|formaggio|yogurt|milk|whey|butter|cream|lactose)\b/.test(ing)) lattosio = 'si';
    else if (/en:milk\b/.test(tr)) lattosio = 'tracce';
    else if (hasData) lattosio = 'no';
    else if (/en:dairies|en:milks|en:cheeses|en:yogurts|en:butters|en:creams/.test(cat)) lattosio = 'si';

    return { gluten, lattosio };
  }

  const DIET_KEY = 'preferenze-dieta';
  async function dietPrefs() {
    try { const r = await window.storage.get(DIET_KEY, false); return r ? JSON.parse(r.value) : {}; } catch (e) { return {}; }
  }
  async function saveDietPrefs(prefs) {
    try { await window.storage.set(DIET_KEY, JSON.stringify(prefs), false); } catch (e) {}
  }

  // -> { level: 'none'|'unknown'|'warn'|'stop', lines: [..], short: 'glutine' }
  async function dietCheck(info) {
    const prefs = await dietPrefs();
    const out = { level: 'none', lines: [], tags: [] };
    if (!prefs.celiachia && !prefs.lattosio) return out;
    const d = (info && info.diet) || { gluten: 'nd', lattosio: 'nd' };
    const rank = { none: 0, unknown: 1, warn: 2, stop: 3 };
    const add = (lvl, line, tag) => { out.lines.push(line); out.tags.push(tag); if (rank[lvl] > rank[out.level]) out.level = lvl; };
    if (prefs.celiachia) {
      if (d.gluten === 'si') add('stop', 'Contiene GLUTINE', 'glutine');
      else if (d.gluten === 'tracce') add('warn', 'Può contenere tracce di glutine', 'tracce glutine');
      else if (d.gluten === 'nd') add('unknown', 'Glutine non verificabile: leggi l\'etichetta', 'glutine?');
    }
    if (prefs.lattosio) {
      if (d.lattosio === 'si') add('stop', 'Contiene LATTE / lattosio', 'lattosio');
      else if (d.lattosio === 'tracce') add('warn', 'Può contenere tracce di latte', 'tracce latte');
      else if (d.lattosio === 'nd') add('unknown', 'Lattosio non verificabile: leggi l\'etichetta', 'lattosio?');
    }
    return out;
  }

  function alertTone() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [0, 0.22].forEach((t) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 330;
        const t0 = audioCtx.currentTime + t;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.2);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  // banner fisso in alto: resta finché non lo chiudi o arriva un altro avviso
  function showDietAlert(name, check) {
    if (!check || check.level === 'none') return;
    let el = document.getElementById('diet-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'diet-banner';
      el.setAttribute('role', 'alert');
      document.body.appendChild(el);
    }
    const col = { stop: ['#B3413A', '#fff'], warn: ['#E37434', '#fff'], unknown: ['#F8EFDD', '#7a5a14'] }[check.level];
    el.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top));z-index:99999;border-radius:14px;padding:12px 44px 12px 14px;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.35);font:600 14px/1.35 Poppins,-apple-system,sans-serif;background:' + col[0] + ';color:' + col[1] + ';max-width:460px;margin:0 auto;';
    const title = check.level === 'stop' ? '⚠️ ATTENZIONE' : check.level === 'warn' ? '⚠️ Controlla' : 'ℹ️ Da verificare';
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    el.innerHTML = '<div style="font-weight:800;font-size:15px;">' + title + (name ? ' · ' + esc(name) : '') + '</div>' +
      check.lines.map((l) => '<div>' + esc(l) + '</div>').join('') +
      '<div style="font-weight:500;font-size:12px;opacity:.9;margin-top:6px;">È solo un consiglio dell\'app: leggi sempre l\'etichetta sulla confezione.</div>' +
      '<button type="button" aria-label="Chiudi" style="position:absolute;right:8px;top:6px;border:0;background:transparent;color:inherit;font-size:24px;line-height:1;cursor:pointer;">×</button>';
    el.querySelector('button').onclick = () => el.remove();
    if (check.level === 'stop' || check.level === 'warn') alertTone();
    clearTimeout(showDietAlert._t);
    if (check.level === 'unknown') showDietAlert._t = setTimeout(() => el && el.remove(), 6000);
  }

  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 1750;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.75, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.16);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.17);
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
  }

  const LOCATION_LABEL = { frigo: 'Frigo', freezer: 'Freezer', dispensa: 'Dispensa', cantina: 'Cantina' };
  const LOCATION_ICON = { frigo: '❄️', freezer: '🧊', dispensa: '🥫', cantina: '🍷' };

  window.ProductRules = { inferFromOFF, lookup, remember, beep, dietFromOFF, weightFromOFF, dietPrefs, saveDietPrefs, dietCheck, showDietAlert, LOCATION_LABEL, LOCATION_ICON };
})();

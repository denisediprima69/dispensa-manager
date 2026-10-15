// Selettore data di scadenza a un tocco: mese+anno (caso più comune), giorno facoltativo, scorciatoie, numeri.
// DatePicker.mount(el, { value, onPick(iso, exact, kind) }) -> { setValue(iso), getValue(), reset() }
// DatePicker.sheet({ value, onPick }) -> apre il selettore in un pannello dal basso (si chiude da solo alla scelta)
(function () {
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (y, m) => new Date(y, m, 0).getDate();
  const fmt = (iso) => { const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; };

  function injectCss() {
    if (document.getElementById('dp-css')) return;
    const st = document.createElement('style'); st.id = 'dp-css';
    st.textContent = `
.dp { font-family: inherit; }
.dp .dp-lbl { font-size: 12px; font-weight: 700; color: var(--text-muted); margin: 14px 0 8px; text-transform: uppercase; letter-spacing: .04em; }
.dp .dp-lbl:first-child { margin-top: 0; }
.dp .dp-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dp .dp-chip { flex: 1; min-width: 70px; text-align: center; background: var(--accent-soft); color: var(--accent); border: none; border-radius: 12px; padding: 13px 6px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.dp .dp-years { display: flex; gap: 6px; margin-bottom: 8px; }
.dp .dp-year { padding: 9px 0 !important; font-size: 13px !important; }
.dp .dp-year { flex: 1; border: 1px solid var(--border); background: var(--surface); border-radius: 10px; padding: 11px 0; font-size: 14px; font-weight: 700; color: var(--text-muted); cursor: pointer; font-family: inherit; }
.dp .dp-year.sel { background: var(--text); color: #fff; border-color: var(--text); }
.dp .dp-grid { display: grid; gap: 8px; }
.dp .dp-grid.m { grid-template-columns: repeat(4, 1fr); }
.dp .dp-grid.d { grid-template-columns: repeat(7, 1fr); }
.dp .dp-btn { border: 1px solid var(--border); background: var(--surface); border-radius: 12px; padding: 15px 0; font-size: 15.5px; font-weight: 700; color: var(--text); cursor: pointer; font-family: inherit; }
.dp .dp-btn.s { padding: 11px 0; font-size: 14px; }
.dp .dp-btn.sel { background: var(--accent); border-color: var(--accent); color: #fff; }
.dp .dp-btn:disabled { opacity: .3; }
.dp .dp-btn:active { background: var(--accent-soft); }
.dp .dp-nav { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 10px; }
.dp .dp-title { font-size: 17px; font-weight: 800; text-transform: capitalize; }
.dp .dp-arrow { width: 42px; height: 42px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); font-size: 22px; font-weight: 700; color: var(--text); cursor: pointer; font-family: inherit; }
.dp .dp-arrow:disabled { opacity: .3; }
.dp .dp-wd { margin-bottom: 4px; }
.dp .dp-wd span { text-align: center; font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
.dp .dp-grid.d { gap: 6px; }
.dp .dp-day { border: none; background: var(--surface); border-radius: 10px; aspect-ratio: 1 / 1; font-size: 15px; font-weight: 600; color: var(--text); cursor: pointer; font-family: inherit; border: 1px solid var(--border); padding: 0; }
.dp .dp-day.today { border-color: var(--accent); color: var(--accent); }
.dp .dp-day.sel { background: var(--accent); border-color: var(--accent); color: #fff; }
.dp .dp-day:disabled { opacity: .25; }
.dp .dp-day:active { background: var(--accent-soft); }
.dp .dp-month-btn { width: 100%; margin-top: 10px; padding: 13px 12px; border: 1.5px solid var(--accent); background: transparent; color: var(--accent); border-radius: 12px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; }
.dp .dp-month-btn.sel { background: var(--accent); color: #fff; }
.dp .dp-result { margin-top: 12px; background: var(--accent-soft); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dp .dp-result b { color: var(--accent); font-size: 16px; }
.dp .dp-result small { display: block; color: var(--text-muted); font-size: 12px; }
.dp .dp-link { background: none; border: none; color: var(--accent); font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; text-decoration: underline; padding: 4px; }
.dp .dp-type { width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 15px; font-family: inherit; background: #fff; color: var(--text); }
.dp .dp-fb { font-size: 12.5px; color: var(--text-muted); margin: 6px 0 0; min-height: 16px; }
.dp-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; display: flex; align-items: flex-end; justify-content: center; }
.dp-sheet { background: var(--bg); width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); }
.dp-sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.dp-sheet-head h3 { margin: 0; font-size: 17px; }
.dp-sheet-head button { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; }
`;
    document.head.appendChild(st);
  }

  function parseDigits(str) {
    return window.DateReader ? window.DateReader.parseDigits(str) : null;
  }
  function addDays(n) {
    if (window.DateReader) return window.DateReader.addDays(n);
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function mount(el, opts) {
    injectCss();
    opts = opts || {};
    const now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate();
    const todayIso = curY + '-' + pad(curM) + '-' + pad(curD);
    const st = { value: null, exact: false, vy: curY, vm: curM };
    el.classList.add('dp');

    function pick(iso, exact, kind) {
      st.value = iso; st.exact = exact;
      st.vy = +iso.slice(0, 4); st.vm = +iso.slice(5, 7);
      render();
      if (opts.onPick) opts.onPick(iso, exact, kind);
    }
    function shift(n) {
      let m = st.vm + n, y = st.vy;
      while (m < 1) { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      st.vy = y; st.vm = m; render();
    }

    function render() {
      const v = st.value, first = new Date(st.vy, st.vm - 1, 1);
      const offset = (first.getDay() + 6) % 7;           // lunedì = 0
      const days = lastDay(st.vy, st.vm);
      const atMin = st.vy === curY && st.vm === curM;
      let h = '<div class="dp-years">';
      for (let i = 0; i < 5; i++) { const y = curY + i; h += '<button type="button" class="dp-year ' + (y === st.vy ? 'sel' : '') + '" data-y="' + y + '">' + y + '</button>'; }
      h += '</div>';
      h += '<div class="dp-nav"><button type="button" class="dp-arrow" data-nav="-1"' + (atMin ? ' disabled' : '') + ' aria-label="Mese precedente">‹</button>' +
        '<div class="dp-title">' + MESI_LUNGHI[st.vm - 1] + ' ' + st.vy + '</div>' +
        '<button type="button" class="dp-arrow" data-nav="1" aria-label="Mese successivo">›</button></div>';
      h += '<div class="dp-grid d dp-wd">' + ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => '<span>' + x + '</span>').join('') + '</div>';
      h += '<div class="dp-grid d">';
      for (let i = 0; i < offset; i++) h += '<span></span>';
      for (let d = 1; d <= days; d++) {
        const iso = st.vy + '-' + pad(st.vm) + '-' + pad(d);
        const dis = iso < todayIso;
        const cls = 'dp-day' + (v === iso && st.exact ? ' sel' : '') + (iso === todayIso ? ' today' : '');
        h += '<button type="button" class="' + cls + '" data-day="' + d + '"' + (dis ? ' disabled' : '') + '>' + d + '</button>';
      }
      h += '</div>';
      const monthIso = st.vy + '-' + pad(st.vm) + '-' + pad(days);
      h += '<button type="button" class="dp-month-btn ' + (v === monthIso && !st.exact ? 'sel' : '') + '" data-month="1">Sulla confezione non c\'è il giorno: vale per tutto ' + MESI_LUNGHI[st.vm - 1] + ' →</button>';
      if (v) {
        h += '<div class="dp-result"><div><small>Hai scelto</small><b>' + fmt(v) + '</b>' + (st.exact ? '' : '<small>scade a fine ' + MESI_LUNGHI[+v.slice(5, 7) - 1] + '</small>') + '</div><span style="font-size:22px;">✓</span></div>';
      }
      h += '<div class="dp-lbl">Preferisci scrivere?</div><input type="text" class="dp-type" inputmode="numeric" autocomplete="off" placeholder="Es. 15/12/2026 oppure 06/2027"><p class="dp-fb"></p>';
      el.innerHTML = h;

      el.querySelectorAll('.dp-year').forEach((b) => b.addEventListener('click', () => { st.vy = +b.dataset.y; if (st.vy === curY && st.vm < curM) st.vm = curM; render(); }));
      el.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => shift(+b.dataset.nav)));
      el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => pick(st.vy + '-' + pad(st.vm) + '-' + pad(+b.dataset.day), true, 'day')));
      el.querySelector('[data-month]').addEventListener('click', () => pick(monthIso, false, 'month'));

      const input = el.querySelector('.dp-type'), fb = el.querySelector('.dp-fb');
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '');
        if (!digits) { fb.textContent = ''; return; }
        const iso = parseDigits(input.value);
        const minOk = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
        if (iso && iso < minOk) { fb.textContent = digits.length < 6 ? '…' : 'Quella data è già passata'; return; }
        if (iso) {
          const monthOnly = digits.length === 4 || (digits.length === 6 && /^(0[1-9]|1[0-2])20\d\d$/.test(digits));
          fb.textContent = '✓ ' + fmt(iso) + (monthOnly ? ' (fine mese)' : '');
          pick(iso, !monthOnly, 'typed');
        } else fb.textContent = 'Scrivi giorno, mese e anno (15/12/2026) oppure solo mese e anno (06/2027)';
      });
    }

    render();
    return {
      setValue(iso) { if (!iso) { st.value = null; st.exact = false; } else { st.value = iso; st.exact = true; st.vy = +iso.slice(0, 4); st.vm = +iso.slice(5, 7); } render(); },
      getValue() { return st.value; },
      reset() { st.value = null; st.exact = false; st.vy = curY; st.vm = curM; render(); },
      showDays() { render(); }
    };
  }

  function sheet(opts) {
    injectCss();
    const bd = document.createElement('div'); bd.className = 'dp-backdrop';
    bd.innerHTML = '<div class="dp-sheet"><div class="dp-sheet-head"><h3>' + (opts.title || 'Quando scade?') + '</h3><button type="button" aria-label="Chiudi">×</button></div><div class="dp-mount"></div></div>';
    document.body.appendChild(bd);
    const close = () => bd.remove();
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
    bd.querySelector('.dp-sheet-head button').addEventListener('click', close);
    const picker = mount(bd.querySelector('.dp-mount'), {
      onPick(iso, exact, kind) {
        opts.onPick(iso, exact, kind);
        setTimeout(close, 100);
      }
    });
    if (opts.value) picker.setValue(opts.value);
    return { close };
  }

  window.DatePicker = { mount, sheet, fmt };
})();

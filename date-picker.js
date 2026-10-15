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
    const now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1;
    const st = { value: null, exact: false, year: curY, showDays: false };
    el.classList.add('dp');

    function pick(iso, exact, kind) {
      st.value = iso; st.exact = exact;
      st.year = +iso.slice(0, 4);
      st.showDays = false;
      render();
      if (opts.onPick) opts.onPick(iso, exact, kind);
    }

    function render() {
      const v = st.value, vy = v ? +v.slice(0, 4) : null, vm = v ? +v.slice(5, 7) : null;
      let h = '';
      h += '<div class="dp-lbl">Scorciatoie</div><div class="dp-chips">' +
        [[3, 'tra 3 giorni'], [7, '1 settimana'], [14, '2 settimane'], [30, '1 mese']].map(([d, l]) => '<button type="button" class="dp-chip" data-d="' + d + '">' + l + '</button>').join('') + '</div>';
      h += '<div class="dp-lbl">Mese e anno — quello scritto sulla confezione</div><div class="dp-years">';
      for (let i = 0; i < 5; i++) { const y = curY + i; h += '<button type="button" class="dp-year ' + (y === st.year ? 'sel' : '') + '" data-y="' + y + '">' + y + '</button>'; }
      h += '</div><div class="dp-grid m">';
      for (let m = 1; m <= 12; m++) {
        const dis = st.year === curY && m < curM;
        h += '<button type="button" class="dp-btn ' + (vy === st.year && vm === m ? 'sel' : '') + '" data-m="' + m + '"' + (dis ? ' disabled' : '') + '>' + MESI[m - 1] + '</button>';
      }
      h += '</div>';
      if (v) {
        h += '<div class="dp-result"><div><small>Scade il</small><b>' + fmt(v) + '</b>' + (st.exact ? '' : '<small>a fine ' + MESI_LUNGHI[vm - 1] + '</small>') + '</div>' +
          '<button type="button" class="dp-link" data-act="days">' + (st.showDays ? 'Nascondi giorni' : (st.exact ? 'Cambia giorno' : 'C\'è anche il giorno →')) + '</button></div>';
        if (st.showDays) {
          h += '<div class="dp-lbl">Giorno</div><div class="dp-grid d">';
          for (let d = 1; d <= lastDay(vy, vm); d++) h += '<button type="button" class="dp-btn s ' + (st.exact && +v.slice(8) === d ? 'sel' : '') + '" data-day="' + d + '">' + d + '</button>';
          h += '</div>';
        }
      }
      h += '<div class="dp-lbl">Oppure scrivi i numeri</div><input type="text" class="dp-type" inputmode="numeric" autocomplete="off" placeholder="0627 = giugno 2027 · 151226 = 15/12/2026"><p class="dp-fb"></p>';
      el.innerHTML = h;

      el.querySelectorAll('.dp-chip').forEach((b) => b.addEventListener('click', () => pick(addDays(+b.dataset.d), true, 'chip')));
      el.querySelectorAll('.dp-year').forEach((b) => b.addEventListener('click', () => { st.year = +b.dataset.y; render(); }));
      el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
        const m = +b.dataset.m; pick(st.year + '-' + pad(m) + '-' + pad(lastDay(st.year, m)), false, 'month');
      }));
      el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => pick(vy + '-' + pad(vm) + '-' + pad(+b.dataset.day), true, 'day')));
      const act = el.querySelector('[data-act="days"]');
      if (act) act.addEventListener('click', () => { st.showDays = !st.showDays; render(); });
      const input = el.querySelector('.dp-type'), fb = el.querySelector('.dp-fb');
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '');
        if (!digits) { fb.textContent = ''; return; }
        const iso = parseDigits(input.value);
        const minOk = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
        if (iso && iso < minOk) { fb.textContent = digits.length < 6 ? '…' : 'Quella data è già passata'; return; }
        if (iso) { fb.textContent = '✓ ' + fmt(iso); pick(iso, digits.length !== 4 && !(digits.length === 6 && /^(0[1-9]|1[0-2])20\d\d$/.test(digits)), 'typed'); }
        else fb.textContent = 'Mese+anno: 0627 · data intera: 151226';
      });
    }

    render();
    return {
      setValue(iso) { if (!iso) { st.value = null; st.exact = false; } else { st.value = iso; st.exact = true; st.year = +iso.slice(0, 4); } render(); },
      getValue() { return st.value; },
      reset() { st.value = null; st.exact = false; st.year = curY; st.showDays = false; render(); },
      showDays() { st.showDays = true; render(); }
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
    if (opts.value) { picker.setValue(opts.value); picker.showDays(); }
    return { close };
  }

  window.DatePicker = { mount, sheet, fmt };
})();

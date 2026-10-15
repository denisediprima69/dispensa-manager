// Se window.storage (ambiente Claude) non esiste, usa localStorage del browser.
(function () {
  if (window.storage && typeof window.storage.get === 'function') return;
  window.storage = {
    async get(key) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? null : { key, value: v };
      } catch (e) { return null; }
    },
    async set(key, value) {
      try { localStorage.setItem(key, value); return { key, value }; }
      catch (e) { return null; }
    },
    async delete(key) {
      try { localStorage.removeItem(key); } catch (e) {}
      return { key, deleted: true };
    }
  };
})();

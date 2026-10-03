/* Cloud backup is deliberately optional: local storage remains authoritative. */
(() => {
  const SETTINGS_KEY = 'ui-builder-cloud-backup-v1';
  const AUTO_INTERVAL = 15 * 60 * 1000;
  const json = value => JSON.parse(JSON.stringify(value));
  const digest = async value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };

  class CloudBackupClient {
    constructor(store) {
      this.store = store;
      this.listeners = new Set();
      this.timer = null;
      this.settings = this.read();
      store.subscribe(() => this.markDirty());
      window.addEventListener('online', () => this.tryAutomatic());
      this.timer = setInterval(() => this.tryAutomatic(), 60 * 1000);
    }
    read() {
      try { return { version: 1, endpoint: '', dirty: false, lastBackupAt: '', lastError: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
      catch (_) { return { version: 1, endpoint: '', dirty: false, lastBackupAt: '', lastError: '' }; }
    }
    write(next) { this.settings = { ...this.settings, ...next }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); this.emit(); }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit() { this.listeners.forEach(listener => { try { listener(this.status()); } catch (_) {} }); }
    status() { return json({ ...this.settings, online: navigator.onLine }); }
    setEndpoint(endpoint) {
      let value = String(endpoint || '').trim().replace(/\/$/, '');
      if (value && !/^https:\/\//i.test(value)) throw new Error('Use uma URL HTTPS do Worker.');
      this.write({ endpoint: value, lastError: '' });
    }
    markDirty() { this.write({ dirty: true }); this.tryAutomatic(); }
    async makeSnapshot() {
      const snapshot = this.store.createLibrarySnapshot();
      snapshot.integrity = { algorithm: 'SHA-256', value: await digest(snapshot) };
      return snapshot;
    }
    async request(path, options = {}) {
      if (!this.settings.endpoint) throw new Error('Configure o endereço protegido do backup primeiro.');
      const response = await fetch(`${this.settings.endpoint}${path}`, { credentials: 'include', ...options });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Autenticação Cloudflare necessária.' : `Backup indisponível (${response.status}).`);
      return response;
    }
    async backupNow() {
      if (!navigator.onLine) throw new Error('Sem conexão. O backup continua pendente.');
      const snapshot = await this.makeSnapshot();
      try {
        await this.request('/backups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot) });
        this.write({ dirty: false, lastBackupAt: new Date().toISOString(), lastError: '' });
      } catch (error) { this.write({ dirty: true, lastError: error.message || 'Falha no backup.' }); throw error; }
    }
    async tryAutomatic() {
      const { dirty, lastBackupAt, endpoint } = this.settings;
      if (!dirty || !endpoint || !navigator.onLine || (lastBackupAt && Date.now() - Date.parse(lastBackupAt) < AUTO_INTERVAL)) return;
      try { await this.backupNow(); } catch (_) { /* retained as pending; no retry loop */ }
    }
    async listBackups() { return (await this.request('/backups')).json(); }
    async getBackup(id) { return (await this.request(`/backups/${encodeURIComponent(id)}`)).json(); }
  }
  window.UiCloudBackup = { CloudBackupClient, AUTO_INTERVAL };
})();

// pi-auth.js — Initialisation SDK Pi Network

const PI_SANDBOX = true; // false en production mainnet

window.piAuth = {
  initialized: false,
  user: null,

  init() {
    if (typeof Pi === 'undefined') return;
    Pi.init({ version: "2.0", sandbox: PI_SANDBOX });
    this.initialized = true;
  },

  async authenticate() {
    if (!this.initialized) this.init();
    if (typeof Pi === 'undefined') return null;

    try {
      const auth = await Pi.authenticate(['username', 'payments'], () => {});
      this.user = auth.user;
      return auth.user;
    } catch (e) {
      console.warn('[Pi Auth] Échec authentification:', e);
      return null;
    }
  }
};

// Auto-init au chargement
window.piAuth.init();

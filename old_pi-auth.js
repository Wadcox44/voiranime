// pi-auth.js — Initialisation SDK Pi Network

const PI_SANDBOX = true; // false en production mainnet

window.piAuth = {
  user: null,

  init() {
    if (typeof Pi === 'undefined') return;
    Pi.init({ version: "2.0", sandbox: PI_SANDBOX });
    this.authenticate();
  },

  async authenticate() {
    if (typeof Pi === 'undefined') return null;
    try {
      const auth = await Pi.authenticate(['username', 'payments'], () => {});
      this.user = { username: auth.user.username, uid: auth.user.uid };
      localStorage.setItem('pi_user', JSON.stringify(this.user));
      return this.user;
    } catch (e) {
      console.warn('[Pi Auth] Échec authentification:', e);
      return null;
    }
  },

  getUser() {
    if (this.user) return this.user;
    const stored = localStorage.getItem('pi_user');
    return stored ? JSON.parse(stored) : null;
  },

  isInPiBrowser() {
    return typeof Pi !== 'undefined';
  }
};

window.piAuth.init();

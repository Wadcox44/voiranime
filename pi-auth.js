// pi-auth.js — Initialisation SDK Pi Network

const isPiBrowser = /PiBrowser/i.test(navigator.userAgent);
const hasPiSDK = typeof window.Pi !== "undefined";

/* ════════════════════════════════
   MODE HORS PI BROWSER (SAFE)
════════════════════════════════ */
if (!isPiBrowser || !hasPiSDK) {
  console.log("[Pi Auth] désactivé (hors Pi Browser)");

  window.piAuth = {
    user: null,

    init() {
      return null;
    },

    authenticate() {
      return Promise.resolve(null);
    },

    getUser() {
      const stored = localStorage.getItem("pi_user");
      return stored ? JSON.parse(stored) : null;
    },

    isInPiBrowser() {
      return false;
    }
  };
}

/* ════════════════════════════════
   MODE PI BROWSER (ACTIF)
════════════════════════════════ */
else {
  const PI_SANDBOX = true; // false en production mainnet

  window.piAuth = {
    user: null,

    init() {
      if (typeof Pi === "undefined") return;

      try {
        Pi.init({ version: "2.0", sandbox: PI_SANDBOX });
        return this.authenticate();
      } catch (e) {
        console.warn("[Pi Auth] init error:", e);
        return null;
      }
    },

    async authenticate() {
      try {
        const auth = await Pi.authenticate(
          ["username", "payments"],
          () => {}
        );

        this.user = {
          username: auth.user.username,
          uid: auth.user.uid
        };

        localStorage.setItem("pi_user", JSON.stringify(this.user));
        return this.user;
      } catch (e) {
        console.warn("[Pi Auth] Échec authentification:", e);
        return null;
      }
    },

    getUser() {
      if (this.user) return this.user;

      const stored = localStorage.getItem("pi_user");
      return stored ? JSON.parse(stored) : null;
    },

    isInPiBrowser() {
      return true;
    }
  };

  // init uniquement si Pi OK
  window.piAuth.init();
}

/* ═══════════════════════════════════════════════════════════════
   premiumPreview.js — VoirAnime
   Preview Mode Premium : test Free / Premium sans toucher Firestore.

   ⚠ ADMIN SEULEMENT — chargé uniquement si VA_ADMIN_MODE détecté.
   ⚠ Ne modifie JAMAIS Firestore, l'abonnement réel, ni les paiements Pi.

   Fonctionnement :
     localStorage 'VA_PREVIEW_PREMIUM' = 'true'  → force Premium
     localStorage 'VA_PREVIEW_PREMIUM' = 'false' → force Free
     absent / 'off'                               → vrai statut utilisateur

   Expose :
     window.VA_PREVIEW_setMode(mode)   → 'premium' | 'free' | 'off'
     window.VA_PREVIEW_getMode()       → mode actuel
     window.VA_PREVIEW_isActive()      → boolean
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STORAGE_KEY  = 'VA_PREVIEW_PREMIUM';
  const ADMIN_KEY    = 'VA_ADMIN_MODE';        // localStorage flag ou username match
  const ADMIN_USERS  = ['WadCox44', 'wadcox']; // piUsernames admins autorisés

  /* ── Magic link URL : ?va_admin=on / off ──────────────────────
     Activation    : https://voir-anime.vercel.app/?va_admin=on
     Désactivation : https://voir-anime.vercel.app/?va_admin=off

     Sécurité (option B) :
     ?va_admin=on ne fonctionne QUE si le piUsername connecté
     est dans ADMIN_USERS. Un visiteur lambda ne peut rien activer,
     même en connaissant l'URL.
  ────────────────────────────────────────────────────────────── */
  (function _handleMagicLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const val    = params.get('va_admin');
      if (!val) return;

      // Nettoie toujours l'URL, même si la vérification échoue
      // → aucune trace du param dans l'historique navigateur
      params.delete('va_admin');
      const clean = window.location.pathname + (params.toString() ? '?' + params : '');
      history.replaceState(null, '', clean);

      if (val === 'on') {
        // Double facteur : vérifie le piUsername connecté
        let piUsername = null;
        try {
          const u = JSON.parse(localStorage.getItem('pi_user') || 'null');
          piUsername = u && u.username ? u.username : null;
        } catch (_) {}

        if (!piUsername || !ADMIN_USERS.includes(piUsername)) {
          // Échec silencieux — aucun message, aucun indice
          return;
        }
        localStorage.setItem(ADMIN_KEY, 'true');

      } else if (val === 'off') {
        // Désactivation : nettoie uniquement son propre localStorage
        localStorage.removeItem(ADMIN_KEY);
        localStorage.removeItem('VA_PREVIEW_PREMIUM');
        window.location.reload();
      }

    } catch (_) {}
  })();

  /* ── Vérifie si on est admin ── */
  function _isAdmin() {
    // Flag posé par magic link ou console
    if (localStorage.getItem(ADMIN_KEY) === 'true') return true;
    // Ou piUsername dans la liste blanche
    try {
      const user = JSON.parse(localStorage.getItem('pi_user') || 'null');
      if (user && ADMIN_USERS.includes(user.username)) return true;
    } catch (_) {}
    return false;
  }

  /* ── Lecture / écriture mode ── */
  function _getMode() {
    return localStorage.getItem(STORAGE_KEY) || 'off';
  }

  function _setMode(mode) {
    if (!['premium', 'free', 'off'].includes(mode)) return;
    if (mode === 'off') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, mode === 'premium' ? 'true' : 'false');
    }
    _updateBadge();
    _reloadPremiumUI();
  }

  /* ── Patch VA_isPremium ──────────────────────────────────────
     On attend que premiumManager.js soit prêt, puis on wrappe.
     Le vrai statut reste accessible via _realIsPremium.
  ────────────────────────────────────────────────────────────── */
  function _patchVAisPremium() {
    const _realFn = window.VA_isPremium;

    window.VA_isPremium = function () {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val === 'true')  return true;
      if (val === 'false') return false;
      return _realFn ? _realFn() : false;
    };

    // Référence au vrai statut (pour debug / affichage dans le switch)
    window.VA_PREVIEW_realIsPremium = _realFn;
  }

  /* ── Relance les fonctions UI qui lisent isPremium ── */
  function _reloadPremiumUI() {
    // Recharge l'état Premium via VA_onPremiumReady si dispo
    try {
      const piUser = JSON.parse(localStorage.getItem('pi_user') || 'null');
      const uid    = piUser?.uid || null;

      // Vide le cache sessionStorage pour forcer relecture
      window.VA_clearPremiumCache?.();

      // Rappelle initPremium pour déclencher les callbacks enregistrés
      // (badges, overlays, section forYou, etc.)
      window.VA_initPremium?.(uid);

    } catch (_) {}

    // Reload la page pour un reset complet propre
    // (évite les états hybrides si des sections sont déjà rendues)
    setTimeout(() => window.location.reload(), 250);
  }

  /* ── Badge ⚠ MODE PREVIEW ── */
  function _createBadge() {
    if (document.getElementById('va-preview-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'va-preview-badge';
    badge.style.cssText = [
      'position:fixed',
      'bottom:70px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:99999',
      'background:rgba(255,179,0,0.12)',
      'border:1px solid rgba(255,179,0,0.45)',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'border-radius:20px',
      'padding:5px 14px 5px 10px',
      'display:flex',
      'align-items:center',
      'gap:7px',
      'font-family:Outfit,sans-serif',
      'font-size:0.72rem',
      'font-weight:700',
      'color:#fbbf24',
      'letter-spacing:0.02em',
      'pointer-events:none',
      'white-space:nowrap',
      'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
      'transition:opacity 0.3s',
    ].join(';');

    badge.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span id="va-preview-badge-label">MODE PREVIEW</span>
    `;

    document.body.appendChild(badge);
  }

  function _updateBadge() {
    const mode  = _getMode();
    const badge = document.getElementById('va-preview-badge');
    const label = document.getElementById('va-preview-badge-label');

    if (mode === 'off') {
      if (badge) badge.style.opacity = '0';
      setTimeout(() => badge?.remove(), 320);
      return;
    }

    if (!badge) _createBadge();

    const el = document.getElementById('va-preview-badge-label');
    if (el) {
      el.textContent = mode === 'premium'
        ? '⭐ PREVIEW — MODE PREMIUM'
        : '👤 PREVIEW — MODE FREE';
    }

    const b = document.getElementById('va-preview-badge');
    if (b) {
      b.style.opacity = '1';
      b.style.borderColor = mode === 'premium'
        ? 'rgba(167,139,250,0.5)'
        : 'rgba(255,179,0,0.45)';
      b.style.color = mode === 'premium' ? '#a78bfa' : '#fbbf24';
      b.querySelector('svg')?.setAttribute('stroke', mode === 'premium' ? '#a78bfa' : '#fbbf24');
    }
  }

  /* ── Switch Admin UI ──────────────────────────────────────────
     Petit widget flottant discret, visible admin seulement.
  ────────────────────────────────────────────────────────────── */
  function _injectSwitch() {
    if (document.getElementById('va-preview-switch')) return;

    const sw = document.createElement('div');
    sw.id = 'va-preview-switch';

    const mode = _getMode();

    sw.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:99998',
      'background:rgba(10,10,25,0.92)',
      'border:1px solid rgba(255,255,255,0.08)',
      'backdrop-filter:blur(16px)',
      '-webkit-backdrop-filter:blur(16px)',
      'border-radius:14px',
      'padding:6px 8px',
      'display:flex',
      'align-items:center',
      'gap:4px',
      'font-family:Outfit,sans-serif',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'user-select:none',
    ].join(';');

    sw.innerHTML = `
      <span style="font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.3);
        letter-spacing:0.08em;padding:0 4px">PREVIEW</span>

      <button id="va-prev-free"
        style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:9px;
          border:1px solid transparent;background:transparent;cursor:pointer;
          font-family:Outfit,sans-serif;font-size:0.72rem;font-weight:700;
          color:rgba(255,255,255,0.45);transition:all 0.18s;white-space:nowrap">
        👤 Free
      </button>

      <button id="va-prev-off"
        style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:9px;
          border:1px solid transparent;background:transparent;cursor:pointer;
          font-family:Outfit,sans-serif;font-size:0.65rem;font-weight:600;
          color:rgba(255,255,255,0.25);transition:all 0.18s;white-space:nowrap">
        ✕
      </button>

      <button id="va-prev-premium"
        style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:9px;
          border:1px solid transparent;background:transparent;cursor:pointer;
          font-family:Outfit,sans-serif;font-size:0.72rem;font-weight:700;
          color:rgba(255,255,255,0.45);transition:all 0.18s;white-space:nowrap">
        ⭐ Premium
      </button>
    `;

    document.body.appendChild(sw);
    _updateSwitchState(mode);

    /* Events */
    document.getElementById('va-prev-free').addEventListener('click', () => {
      _setMode(_getMode() === 'free' ? 'off' : 'free');
    });
    document.getElementById('va-prev-off').addEventListener('click', () => {
      _setMode('off');
    });
    document.getElementById('va-prev-premium').addEventListener('click', () => {
      _setMode(_getMode() === 'premium' ? 'off' : 'premium');
    });
  }

  function _updateSwitchState(mode) {
    const btnFree    = document.getElementById('va-prev-free');
    const btnOff     = document.getElementById('va-prev-off');
    const btnPremium = document.getElementById('va-prev-premium');
    if (!btnFree) return;

    const ACTIVE_FREE = [
      'background:rgba(255,179,0,0.14)',
      'border-color:rgba(255,179,0,0.4)',
      'color:#fbbf24',
    ].join(';');

    const ACTIVE_PREMIUM = [
      'background:rgba(167,139,250,0.14)',
      'border-color:rgba(167,139,250,0.4)',
      'color:#a78bfa',
    ].join(';');

    const ACTIVE_OFF = [
      'background:rgba(255,255,255,0.06)',
      'border-color:rgba(255,255,255,0.12)',
      'color:rgba(255,255,255,0.55)',
    ].join(';');

    // Reset tous
    btnFree.removeAttribute('style');
    btnOff.removeAttribute('style');
    btnPremium.removeAttribute('style');

    const base = 'display:flex;align-items:center;gap:5px;border-radius:9px;cursor:pointer;font-family:Outfit,sans-serif;font-weight:700;transition:all 0.18s;white-space:nowrap;border:1px solid transparent;background:transparent;';
    btnFree.style.cssText    = base + 'padding:5px 12px;font-size:0.72rem;color:rgba(255,255,255,0.45);';
    btnOff.style.cssText     = base + 'padding:5px 10px;font-size:0.65rem;color:rgba(255,255,255,0.25);';
    btnPremium.style.cssText = base + 'padding:5px 12px;font-size:0.72rem;color:rgba(255,255,255,0.45);';

    if (mode === 'free')    btnFree.style.cssText    += ACTIVE_FREE;
    if (mode === 'off')     btnOff.style.cssText      += ACTIVE_OFF;
    if (mode === 'premium') btnPremium.style.cssText += ACTIVE_PREMIUM;
  }

  /* ── API publique ── */
  window.VA_PREVIEW_setMode = function (mode) {
    if (!_isAdmin()) { console.warn('[VA Preview] Admin only'); return; }
    _setMode(mode);
    _updateSwitchState(mode);
  };

  window.VA_PREVIEW_getMode = function () {
    return _getMode();
  };

  window.VA_PREVIEW_isActive = function () {
    return _getMode() !== 'off';
  };

  /* ── Boot ── */
  function _boot() {
    if (!_isAdmin()) return; // non-admin : ne rien injecter

    // Patch VA_isPremium dès que premiumManager l'a défini
    // premiumManager se charge via <script> avant ce fichier,
    // mais son init async peut pas encore avoir tourné → on wrappe quand même.
    _patchVAisPremium();

    // Ré-appliquer le patch après VA_initPremium (qui redéfinit VA_isPremium)
    // On hook VA_onPremiumReady pour être sûr d'être après
    const _origOnReady = window.VA_onPremiumReady;
    if (_origOnReady) {
      _origOnReady(function () {
        // premiumManager a fini son init → on repatche pour être au-dessus
        _patchVAisPremium();
      });
    }

    const mode = _getMode();
    if (mode !== 'off') _createBadge();
    _updateBadge();
    _injectSwitch();
    _updateSwitchState(mode);

    console.info(
      `%c[VA Preview] Admin mode actif — preview: ${mode}`,
      'color:#a78bfa;font-weight:bold'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

})();

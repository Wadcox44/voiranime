/* ═══════════════════════════════════════════════════════════════
   VoirAnime — premiumManager.js
   Gestion client du statut Premium

   Usage :
     await VA_initPremium(piUserId)
     VA_isPremium()                  → bool
     VA_getPremiumStatus()           → { isPremium, plan, daysLeft, ... }
     VA_renderPremiumBadge(el)       → injecte badge dans un élément
     VA_showSubscriptionModal()      → affiche le modal de choix de plan
   ═══════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'VA_premium_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1h — reconsulte le serveur après 1h

let _status    = null;  // { isPremium, plan, daysLeft, expiresAt, features }
let _piUserId  = null;
let _initDone  = false;
const _cbs     = [];

/* ── Plans ── */
const PLANS = {
  monthly: { label: 'Monthly',  price: '1.99 Pi',  period: '/month', amount: 1.99,  durationDays: 30  },
  annual:  { label: 'Annual',   price: '19.99 Pi', period: '/year',  amount: 19.99, durationDays: 365,
             badge: 'Best value', savings: 'Save 2 months' },
};

/* ── Cache sessionStorage ── */
function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}
function setCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

/* ── Init ── */
async function VA_initPremium(piUserId) {
  _piUserId = piUserId || null;

  const cached = getCached();
  if (cached) {
    _status   = cached;
    _initDone = true;
    _cbs.forEach(cb => cb(_status));
    _applyBadges();
    return _status;
  }

  try {
    const url = piUserId
      ? `/api/premium?piUserId=${encodeURIComponent(piUserId)}`
      : '/api/premium?piUserId=';
    const res  = await fetch(url);
    const data = await res.json();
    _status = data;
    setCache(data);
  } catch (e) {
    console.warn('[premium] Init failed:', e.message);
    _status = { isPremium: false, plan: null, daysLeft: 0, features: { favoritesLimit: 20 } };
  }

  _initDone = true;
  _cbs.forEach(cb => cb(_status));
  _applyBadges();
  return _status;
}

/* ── API publique ── */
function VA_isPremium()        { return _status?.isPremium === true; }
function VA_getPremiumStatus() { return _status || { isPremium: false }; }

function VA_onPremiumReady(cb) {
  if (_initDone) { cb(_status); return; }
  _cbs.push(cb);
}

/* ── Badge profil ── */
function VA_renderPremiumBadge(containerEl) {
  if (!containerEl) return;
  const existing = containerEl.querySelector('.va-premium-badge');
  if (existing) existing.remove();

  if (!VA_isPremium()) return;

  const badge = document.createElement('span');
  badge.className   = 'va-premium-badge';
  badge.textContent = '⭐ Premium';
  containerEl.appendChild(badge);
}

function _applyBadges() {
  // Badge automatique sur data-premium-badge
  document.querySelectorAll('[data-premium-badge]').forEach(el => {
    VA_renderPremiumBadge(el);
  });

  // Masquer les éléments data-premium-only si Free
  document.querySelectorAll('[data-premium-only]').forEach(el => {
    el.style.display = VA_isPremium() ? '' : 'none';
  });

  // Afficher les éléments data-free-only si Free
  document.querySelectorAll('[data-free-only]').forEach(el => {
    el.style.display = VA_isPremium() ? 'none' : '';
  });
}

/* ── Modal de souscription ── */
function VA_showSubscriptionModal(opts = {}) {
  document.getElementById('vaPremiumModal')?.remove();

  const status     = VA_getPremiumStatus();
  const isRenewal  = status.isPremium;
  const title      = isRenewal ? '🔄 Renew Premium' : '⭐ Go Premium';
  const subtitle   = isRenewal
    ? `Your subscription expires in ${status.daysLeft} day${status.daysLeft !== 1 ? 's' : ''}.`
    : 'Unlock all features — unlimited favorites, stats, early access & more.';

  const modal = document.createElement('div');
  modal.id        = 'vaPremiumModal';
  modal.className = 'va-premium-modal';

  modal.innerHTML = `
    <div class="va-premium-box">
      <button class="va-premium-close" id="vaPremiumClose">✕</button>

      <div class="va-premium-header">
        <div class="va-premium-title">${title}</div>
        <div class="va-premium-sub">${subtitle}</div>
      </div>

      <!-- Features list -->
      <ul class="va-premium-features">
        <li>❤ <strong>Unlimited favorites</strong> <span class="free-limit">Free: 20 max</span></li>
        <li>📊 <strong>Detailed stats</strong> — time, genres, history</li>
        <li>↕ <strong>Reorder favorites</strong> drag & drop</li>
        <li>⚡ <strong>Early access</strong> to new features (15 days before Free)</li>
        <li>🔔 <strong>Premium notifications</strong> — recommendations, trending</li>
        <li>⭐ <strong>Premium badge</strong> on your profile</li>
      </ul>

      <!-- Plans -->
      <div class="va-premium-plans">
        ${Object.entries(PLANS).map(([planId, plan]) => `
          <div class="va-plan-card ${planId === 'annual' ? 'va-plan-featured' : ''}"
               data-plan="${planId}">
            ${plan.badge ? `<div class="va-plan-badge">${plan.badge}</div>` : ''}
            <div class="va-plan-name">${plan.label}</div>
            <div class="va-plan-price">${plan.price}<span class="va-plan-period">${plan.period}</span></div>
            ${plan.savings ? `<div class="va-plan-savings">${plan.savings}</div>` : ''}
            <button class="va-plan-btn" data-plan="${planId}" id="vaPlanBtn_${planId}">
              Subscribe
            </button>
          </div>
        `).join('')}
      </div>

      <div class="va-premium-note">
        Secure payment via Pi Wallet · Cancel anytime
      </div>

      <!-- Zone statut paiement -->
      <div class="va-premium-status" id="vaPremiumStatus" style="display:none"></div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('va-premium-modal-open'));

  // Fermeture
  const close = () => {
    modal.classList.remove('va-premium-modal-open');
    setTimeout(() => modal.remove(), 300);
  };
  document.getElementById('vaPremiumClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  // Boutons plans
  Object.keys(PLANS).forEach(planId => {
    document.getElementById(`vaPlanBtn_${planId}`)?.addEventListener('click', () => {
      _startSubscription(planId, opts.onSuccess);
    });
  });

  // Pré-lancer le paiement si defaultPlan fourni (depuis profile.html)
  if (opts.defaultPlan && PLANS[opts.defaultPlan]) {
    setTimeout(() => _startSubscription(opts.defaultPlan, opts.onSuccess), 200);
  }
}

/* ── Lancement paiement Pi ── */
async function _startSubscription(planId, onSuccess) {
  const plan     = PLANS[planId];
  const statusEl = document.getElementById('vaPremiumStatus');

  if (!plan) return;
  if (typeof Pi === 'undefined') {
    _setStatus('⚠️ Pi Browser required to subscribe.', 'warn', statusEl);
    return;
  }

  // Désactiver les boutons pendant le paiement
  document.querySelectorAll('.va-plan-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.6'; });
  _setStatus('⏳ Authenticating with Pi…', 'info', statusEl);

  try {
    const auth = await Pi.authenticate(['payments', 'username'], (incompletePmt) => {
      if (!incompletePmt?.identifier) return;
      fetch('https://voir-anime.vercel.app/api/pi-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: incompletePmt.identifier,
          txid:      incompletePmt.transaction?.txid,
          piUserId:  _piUserId,
          plan:      planId,
          piUsername: incompletePmt.user?.username,
        }),
      }).catch(() => {});
    });

    const piUsername = auth.user?.username || '';
    _setStatus('⏳ Creating payment…', 'info', statusEl);

    Pi.createPayment(
      {
        amount:   plan.amount,
        memo:     `VoirAnime Premium ${plan.label}`,
        metadata: { app: 'voiranime', type: 'subscription', plan: planId },
      },
      {
        onReadyForServerApproval: (paymentId) => {
          _setStatus('⏳ Server approval…', 'info', statusEl);
          fetch('https://voir-anime.vercel.app/api/pi-approve', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ paymentId, plan: planId }),
          }).catch(() => {});
        },

        onReadyForServerCompletion: async (paymentId, txid) => {
          _setStatus('⏳ Activating Premium…', 'info', statusEl);
          try {
            const res  = await fetch('https://voir-anime.vercel.app/api/pi-complete', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ paymentId, txid, piUserId: _piUserId, plan: planId, piUsername }),
            });
            const data = await res.json();

            if (data.premium?.isPremium) {
              _setStatus(`✅ Premium ${plan.label} activated! 🎉`, 'success', statusEl);
              clearCache();
              _status = { ..._status, isPremium: true, plan: planId };
              _applyBadges();
              setTimeout(() => {
                if (onSuccess) onSuccess(data.premium);
                else location.reload(); // Recharger pour appliquer toutes les features
              }, 2000);
            } else {
              _setStatus('✅ Payment confirmed. Activating…', 'success', statusEl);
              setTimeout(() => location.reload(), 2000);
            }
          } catch {
            _setStatus('✅ Payment received! Refreshing…', 'success', statusEl);
            setTimeout(() => location.reload(), 2000);
          }
        },

        onCancel: () => {
          _setStatus('Payment cancelled.', 'info', statusEl);
          document.querySelectorAll('.va-plan-btn').forEach(b => { b.disabled = false; b.style.opacity = ''; });
        },

        onError: (err) => {
          _setStatus(`❌ ${err?.message || 'Payment error'}`, 'error', statusEl);
          document.querySelectorAll('.va-plan-btn').forEach(b => { b.disabled = false; b.style.opacity = ''; });
        },
      }
    );
  } catch (e) {
    _setStatus(`❌ ${e.message || 'Auth failed'}`, 'error', statusEl);
    document.querySelectorAll('.va-plan-btn').forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

function _setStatus(msg, type, el) {
  if (!el) return;
  el.style.display = 'block';
  el.className     = `va-premium-status va-status-${type}`;
  el.textContent   = msg;
}

/* ── Exports globaux ── */
window.VA_initPremium          = VA_initPremium;
window.VA_isPremium            = VA_isPremium;
window.VA_getPremiumStatus     = VA_getPremiumStatus;
window.VA_onPremiumReady       = VA_onPremiumReady;
window.VA_renderPremiumBadge   = VA_renderPremiumBadge;
window.VA_showSubscriptionModal = VA_showSubscriptionModal;
window.VA_clearPremiumCache    = clearCache;

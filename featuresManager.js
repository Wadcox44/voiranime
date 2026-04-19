/* ═══════════════════════════════════════════════════════════════
   VoirAnime — featuresManager.js
   Gestion des feature flags Free vs Premium côté client

   Usage :
     await VA_initFeatures(piUserId)
     VA_isFeatureEnabled('catalogue_v2')   → true/false
     VA_getFeatureStatus('catalogue_v2')   → { accessible, daysUntilFree, ... }
     VA_guardFeature('catalogue_v2', el)   → affiche/masque un élément
   ═══════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'VA_features_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 min — rafraîchi à chaque session

let _features   = {};    // { featureId: { accessible, daysUntilFree, ... } }
let _isPremium  = false;
let _initDone   = false;
const _readyCbs = [];

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

/* ── Init ── */
async function VA_initFeatures(piUserId) {
  const cached = getCached();
  if (cached) {
    _features  = cached.features || {};
    _isPremium = cached.isPremium || false;
    _initDone  = true;
    _readyCbs.forEach(cb => cb());
    _applyGuards();
    return;
  }

  try {
    const url = piUserId
      ? `/api/features?piUserId=${encodeURIComponent(piUserId)}`
      : '/api/features';
    const res  = await fetch(url);
    const data = await res.json();

    _features  = data.features  || {};
    _isPremium = data.isPremium || false;
    setCache({ features: _features, isPremium: _isPremium });
  } catch (e) {
    console.warn('[features] Init failed:', e.message);
    _features  = {};
    _isPremium = false;
  }

  _initDone = true;
  _readyCbs.forEach(cb => cb());
  _applyGuards();
}

/* ── API publique ── */

// Retourne true si la feature est accessible (Premium ou délai écoulé)
function VA_isFeatureEnabled(featureId) {
  const f = _features[featureId];
  return f ? f.accessible === true : true; // feature inconnue = toujours accessible
}

// Retourne le statut complet d'une feature
function VA_getFeatureStatus(featureId) {
  return _features[featureId] || { accessible: true, reason: 'unknown' };
}

// Callback quand les features sont chargées
function VA_onFeaturesReady(cb) {
  if (_initDone) { cb(); return; }
  _readyCbs.push(cb);
}

// Masque/affiche un élément selon l'accès à une feature
// Affiche un bandeau "disponible dans X jours" si Free + délai en cours
function VA_guardFeature(featureId, containerEl, opts = {}) {
  if (!containerEl) return;
  const status = VA_getFeatureStatus(featureId);

  if (status.accessible) {
    containerEl.style.display = '';
    return;
  }

  if (opts.hide) {
    // Masquer entièrement
    containerEl.style.display = 'none';
    return;
  }

  // Afficher un overlay "bientôt disponible"
  containerEl.style.position = 'relative';
  const existing = containerEl.querySelector('.feature-gate-overlay');
  if (existing) return;

  const freeDate = status.freeAt
    ? new Date(status.freeAt).toLocaleDateString(
        document.documentElement.lang === 'fr' ? 'fr-FR' : 'en-US',
        { day: 'numeric', month: 'long' }
      )
    : null;

  const overlay = document.createElement('div');
  overlay.className = 'feature-gate-overlay';
  overlay.innerHTML = `
    <div class="feature-gate-box">
      <div class="feature-gate-icon">⭐</div>
      <div class="feature-gate-title">Premium Early Access</div>
      ${status.daysUntilFree > 0 ? `
        <div class="feature-gate-msg">
          Available for free on <strong>${freeDate}</strong><br>
          <span class="feature-gate-days">${status.daysUntilFree} day${status.daysUntilFree !== 1 ? 's' : ''} left</span>
        </div>
      ` : ''}
      <a href="soutenir.html" class="feature-gate-cta">
        Get Premium — Access now
      </a>
    </div>
  `;
  containerEl.appendChild(overlay);
}

/* ── Application automatique des data-feature guards ── */
// Usage HTML : <div data-feature="catalogue_v2" data-feature-mode="overlay|hide">...</div>
function _applyGuards() {
  document.querySelectorAll('[data-feature]').forEach(el => {
    const featureId = el.getAttribute('data-feature');
    const mode      = el.getAttribute('data-feature-mode') || 'overlay';
    VA_guardFeature(featureId, el, { hide: mode === 'hide' });
  });
}

/* ── Exports globaux ── */
window.VA_initFeatures      = VA_initFeatures;
window.VA_isFeatureEnabled  = VA_isFeatureEnabled;
window.VA_getFeatureStatus  = VA_getFeatureStatus;
window.VA_onFeaturesReady   = VA_onFeaturesReady;
window.VA_guardFeature      = VA_guardFeature;

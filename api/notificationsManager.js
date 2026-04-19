/* ═══════════════════════════════════════════════════════════════
   VoirAnime — notificationsManager.js
   Gestion client des notifications Free / Premium
   - Fetch depuis /api/notifications-get (vérification serveur)
   - Cache sessionStorage 1h max
   - Badge dans la navbar
   - Panneau de notifications
   ═══════════════════════════════════════════════════════════════ */

const CACHE_KEY = 'VA_notifs_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 heure — après quoi le serveur est reconsulté

/* ── Icônes par type ──────────────────────────────────────────────────────
   Pour ajouter un type : ajouter l'icône ici + gérer dans renderNotif()
─────────────────────────────────────────────────────────────────────────── */
const NOTIF_ICONS = {
  new_episode:    '📺',
  recommendation: '✨',
  trending:       '📈',
  similar:        '🎯',
};

/* ── Cache sessionStorage ─────────────────────────────────────────────── */
function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {}
}

function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

/* ── Fetch serveur ────────────────────────────────────────────────────── */
async function fetchNotifications(piUserId) {
  // 1. Essayer le cache d'abord
  const cached = getCached();
  if (cached) return cached;

  // 2. Sinon appeler le serveur
  const res = await fetch(`/api/notifications-get?piUserId=${encodeURIComponent(piUserId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  setCache(data);
  return data;
}

async function markRead(piUserId, notifId = null) {
  clearCache(); // invalider le cache immédiatement
  await fetch('/api/notifications', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'read', piUserId, notifId }),
  });
}

/* ── Rendu d'une notification ─────────────────────────────────────────── */
function renderNotif(notif, piUserId, onRead) {
  const icon     = NOTIF_ICONS[notif.type] || '🔔';
  const isPremBadge = notif.tier === 'premium'
    ? '<span class="notif-premium-badge">Premium</span>'
    : '';
  const readClass = notif.read ? 'notif-read' : 'notif-unread';
  const timeAgo   = formatTimeAgo(notif.createdAt);

  const el = document.createElement('div');
  el.className = `notif-item ${readClass}`;
  el.dataset.id = notif.id;
  el.innerHTML = `
    <div class="notif-img-wrap">
      ${notif.animeImg
        ? `<img src="${notif.animeImg}" alt="" class="notif-img" loading="lazy"/>`
        : `<div class="notif-img-placeholder">${icon}</div>`}
    </div>
    <div class="notif-body">
      <div class="notif-header">
        <span class="notif-icon">${icon}</span>
        ${isPremBadge}
        <span class="notif-time">${timeAgo}</span>
      </div>
      <p class="notif-message">${notif.message}</p>
      ${notif.animeId
        ? `<a href="anime.html?id=${notif.animeId}" class="notif-link">View anime →</a>`
        : ''}
    </div>
    ${!notif.read
      ? `<button class="notif-read-btn" aria-label="Mark as read" data-id="${notif.id}">✓</button>`
      : ''}
  `;

  // Marquer comme lu au clic
  el.querySelector('.notif-read-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await markRead(piUserId, notif.id);
    el.classList.replace('notif-unread', 'notif-read');
    el.querySelector('.notif-read-btn')?.remove();
    if (onRead) onRead();
  });

  return el;
}

/* ── Panneau principal ────────────────────────────────────────────────── */
function buildPanel(container, data, piUserId, onBadgeUpdate) {
  const { notifications, isPremium, unreadCount } = data;

  container.innerHTML = '';

  // Header panneau
  const header = document.createElement('div');
  header.className = 'notif-panel-header';
  header.innerHTML = `
    <div class="notif-panel-title">
      🔔 Notifications
      ${unreadCount > 0 ? `<span class="notif-badge-count">${unreadCount}</span>` : ''}
    </div>
    <div class="notif-panel-actions">
      ${unreadCount > 0
        ? `<button class="notif-mark-all-btn">Mark all read</button>`
        : ''}
      ${!isPremium
        ? `<a href="soutenir.html" class="notif-premium-cta">⭐ Go Premium</a>`
        : ''}
    </div>
  `;
  container.appendChild(header);

  // Bandeau upgrade si free
  if (!isPremium) {
    const upgrade = document.createElement('div');
    upgrade.className = 'notif-upgrade-banner';
    upgrade.innerHTML = `
      <div class="notif-upgrade-content">
        <span class="notif-upgrade-icon">⭐</span>
        <div>
          <div class="notif-upgrade-title">Upgrade to Premium</div>
          <div class="notif-upgrade-sub">Get recommendations, trending alerts & more</div>
        </div>
        <a href="soutenir.html" class="notif-upgrade-btn">1.99 Pi/month</a>
      </div>
    `;
    container.appendChild(upgrade);
  }

  // Liste
  if (notifications.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.innerHTML = `
      <div class="notif-empty-icon">🔔</div>
      <p>No notifications yet.</p>
      <p class="notif-empty-sub">Add anime to your favorites to get episode alerts!</p>
    `;
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'notif-list';

  notifications.forEach(notif => {
    list.appendChild(renderNotif(notif, piUserId, () => {
      onBadgeUpdate && onBadgeUpdate();
    }));
  });

  container.appendChild(list);

  // Mark all read
  header.querySelector('.notif-mark-all-btn')?.addEventListener('click', async () => {
    await markRead(piUserId, null);
    container.querySelectorAll('.notif-unread').forEach(el => {
      el.classList.replace('notif-unread', 'notif-read');
      el.querySelector('.notif-read-btn')?.remove();
    });
    header.querySelector('.notif-badge-count')?.remove();
    header.querySelector('.notif-mark-all-btn')?.remove();
    onBadgeUpdate && onBadgeUpdate(0);
  });
}

/* ── Badge navbar ─────────────────────────────────────────────────────── */
function updateBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  badge.textContent  = count > 99 ? '99+' : count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

/* ── Time ago ─────────────────────────────────────────────────────────── */
function formatTimeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 60000)          return 'Just now';
  if (diff < 3600000)        return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)       return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/* ── Init principale ──────────────────────────────────────────────────── */
async function initNotifications(piUserId) {
  if (!piUserId) return;

  const toggleBtn   = document.getElementById('notifToggle');
  const panelEl     = document.getElementById('notifPanel');
  if (!toggleBtn || !panelEl) return;

  let panelOpen = false;

  // Charger les notifs
  async function load() {
    try {
      const data = await fetchNotifications(piUserId);
      updateBadge(data.unreadCount || 0);

      if (panelOpen) {
        buildPanel(panelEl, data, piUserId, (count) => {
          updateBadge(typeof count === 'number' ? count : 0);
        });
      }

      return data;
    } catch (e) {
      console.warn('[notifs] Load failed:', e.message);
    }
  }

  // Toggle panneau
  toggleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    panelEl.classList.toggle('notif-panel-open', panelOpen);

    if (panelOpen) {
      clearCache(); // Toujours fraîches à l'ouverture
      const data = await fetchNotifications(piUserId);
      buildPanel(panelEl, data, piUserId, (count) => {
        updateBadge(typeof count === 'number' ? count : 0);
      });
      updateBadge(data.unreadCount || 0);
    }
  });

  // Fermer au clic extérieur
  document.addEventListener('click', (e) => {
    if (panelOpen && !panelEl.contains(e.target) && e.target !== toggleBtn) {
      panelOpen = false;
      panelEl.classList.remove('notif-panel-open');
    }
  });

  // Chargement initial (badge uniquement, pas le panneau)
  await load();
}

/* ── Export global ────────────────────────────────────────────────────── */
window.VA_initNotifications = initNotifications;
window.VA_clearNotifsCache  = clearCache;

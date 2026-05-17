// api/alerts.js
// Alertes email admin via Resend
// Appelé en interne par les autres endpoints (admin.js, notifications.js)
// POST { secret, type, data }
//
// Types d'alertes :
//   payment_failed     → paiement non activé après plusieurs tentatives
//   payment_success    → nouveau paiement activé
//   new_churn          → abonnement expiré sans renouvellement
//   new_subscriber     → nouvel abonné Premium
//   users_spike        → pic inhabituel de nouveaux inscrits
//   repair_needed      → paiements en attente de réparation

const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const ADMIN_SECRET    = process.env.ADMIN_SECRET;
const ADMIN_EMAIL     = 'voiranime.admin@gmail.com';
const FROM_EMAIL      = 'onboarding@resend.dev';
const SITE_NAME       = 'VoirAnime';

function getSecret(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.body?.secret || '';
}

// ── Templates email ───────────────────────────────────────────────────────────
function buildEmail(type, data) {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  const templates = {

    payment_failed: {
      subject: `⚠️ [${SITE_NAME}] Paiement non activé — ${data.paymentId || ''}`,
      html: `
        <h2 style="color:#ef4444">⚠️ Paiement non activé</h2>
        <p>Un paiement Pi n'a pas pu être activé après plusieurs tentatives.</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">Payment ID</td><td style="padding:8px;font-family:monospace">${data.paymentId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Tentatives</td><td style="padding:8px">${data.attempts || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">${now}</td></tr>
        </table>
        <p style="margin-top:16px">
          <a href="https://voir-anime.vercel.app/va-ctrl-9x#va-9xKm2pR" 
             style="background:#7c4dff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Réparer dans l'admin
          </a>
        </p>
      `,
    },

    payment_success: {
      subject: `✅ [${SITE_NAME}] Nouveau paiement activé — ${data.plan || ''}`,
      html: `
        <h2 style="color:#22c55e">✅ Nouveau paiement activé</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUsername || data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Montant</td><td style="padding:8px">${data.amount || '—'} Pi</td></tr>
          <tr><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">${now}</td></tr>
        </table>
      `,
    },

    new_churn: {
      subject: `📉 [${SITE_NAME}] Abonnement expiré — ${data.piUserId || ''}`,
      html: `
        <h2 style="color:#f59e0b">📉 Abonnement expiré sans renouvellement</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUsername || data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Expiré le</td><td style="padding:8px">${now}</td></tr>
        </table>
      `,
    },

    new_subscriber: {
      subject: `⭐ [${SITE_NAME}] Nouvel abonné Premium — ${data.plan || ''}`,
      html: `
        <h2 style="color:#a78bfa">⭐ Nouvel abonné Premium</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUsername || data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">${now}</td></tr>
        </table>
      `,
    },

    users_spike: {
      subject: `🚨 [${SITE_NAME}] Pic d'inscriptions détecté`,
      html: `
        <h2 style="color:#ef4444">🚨 Pic d'inscriptions inhabituel</h2>
        <p>${data.newUsers || '?'} nouveaux inscrits en ${data.period || '1h'} — activité suspecte possible.</p>
        <p style="margin-top:16px">
          <a href="https://voir-anime.vercel.app/va-ctrl-9x#va-9xKm2pR"
             style="background:#7c4dff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Vérifier dans l'admin
          </a>
        </p>
      `,
    },

    repair_needed: {
      subject: `🔧 [${SITE_NAME}] ${data.count || '?'} paiement(s) à réparer`,
      html: `
        <h2 style="color:#f59e0b">🔧 Paiements en attente de réparation</h2>
        <p>${data.count || '?'} paiement(s) sont dans l'état <strong>paid_not_activated</strong>.</p>
        <p style="margin-top:16px">
          <a href="https://voir-anime.vercel.app/va-ctrl-9x#va-9xKm2pR"
             style="background:#7c4dff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Réparer dans l'admin
          </a>
        </p>
      `,
    },

  };

  return templates[type] || null;
}

// ── Envoi via Resend ──────────────────────────────────────────────────────────
export async function sendAlert(type, data = {}) {
  if (!RESEND_API_KEY) {
    console.warn('[alerts] RESEND_API_KEY manquant — email non envoyé');
    return false;
  }

  const tpl = buildEmail(type, data);
  if (!tpl) {
    console.warn('[alerts] Template inconnu:', type);
    return false;
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${SITE_NAME} <${FROM_EMAIL}>`,
        to:      [ADMIN_EMAIL],
        subject: tpl.subject,
        html:    `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
            ${tpl.html}
            <hr style="margin-top:32px;border:none;border-top:1px solid #e2e8f0"/>
            <p style="font-size:12px;color:#94a3b8;margin-top:12px">
              ${SITE_NAME} Admin Alerts · Envoyé automatiquement
            </p>
          </div>
        `,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('[alerts] Resend error:', err);
      return false;
    }

    console.log('[alerts] Email envoyé:', type);
    return true;

  } catch(e) {
    console.error('[alerts] Fetch error:', e.message);
    return false;
  }
}

// ── Handler HTTP (test + appels manuels depuis admin) ─────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const secret = getSecret(req);
  if (!secret || secret !== ADMIN_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const { type, data } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });

  const ok = await sendAlert(type, data || {});
  return res.status(ok ? 200 : 500).json({ ok, type });
}

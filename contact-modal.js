/* ═══════════════════════════════════════════
   CONTACT MODAL — JS (vanilla, zero deps)
   VoirAnime — branché sur /api/admin
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  const modal      = document.getElementById('footerContactModal');
  const form       = document.getElementById('contactForm');
  const submitBtn  = document.getElementById('contactSubmitBtn');
  const successMsg = document.getElementById('contactSuccess');
  const errMsg     = document.getElementById('cmErrorMsg');
  const hiddenLang = document.getElementById('hiddenLang');
  const hiddenUrl  = document.getElementById('hiddenUrl');

  const closeTriggers = modal.querySelectorAll('[data-close-modal]');
  const openBtn = document.getElementById('openContactBtn');

  // ── Sujet → champ anime conditionnel ──────────────────────────────────
  var subjectEl = document.getElementById('contactSubject');
  if (subjectEl) {
    subjectEl.addEventListener('change', function() {
      var animeSubjects = ['anime_manquant','probleme_video','bug_technique'];
      var show = animeSubjects.indexOf(this.value) !== -1;
      document.getElementById('cmAnimeField').style.display = show ? 'block' : 'none';
    });
  }

  // ── OPEN ──────────────────────────────────────────────────────────────
  function openModal() {
    hiddenLang.value = navigator.language || 'unknown';
    hiddenUrl.value  = window.location.href;

    // Pi Network : pré-remplir si connecté
    var piUser = null;
    try { piUser = JSON.parse(localStorage.getItem('pi_user') || 'null'); } catch(e) {}

    var identityEl  = document.getElementById('cmPiIdentity');
    var manualFields = document.getElementById('cmManualFields');
    var piNameEl    = document.getElementById('cmPiName');
    var cmPiUid     = document.getElementById('cmPiUid');
    var cmPiUsername = document.getElementById('cmPiUsername');

    if (piUser && piUser.uid) {
      identityEl.style.display  = 'flex';
      manualFields.style.display = 'none';
      piNameEl.textContent = '@' + (piUser.username || piUser.uid.slice(0,8));
      cmPiUid.value      = piUser.uid;
      cmPiUsername.value = piUser.username || '';
      // Champs manuels non requis
      ['contactFirstname','contactLastname','contactEmail'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.removeAttribute('required');
      });
    } else {
      identityEl.style.display  = 'none';
      manualFields.style.display = 'block';
      ['contactFirstname','contactLastname','contactEmail'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.setAttribute('required','');
      });
    }

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(function() {
      var first = modal.querySelector('select, input, textarea');
      if (first) first.focus();
    }, 350);
  }

  // ── CLOSE ─────────────────────────────────────────────────────────────
  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function() {
      form.reset();
      successMsg.hidden = true;
      submitBtn.style.display = '';
      submitBtn.classList.remove('is-loading');
      if (errMsg) errMsg.textContent = '';
      document.getElementById('cmAnimeField').style.display = 'none';
      cmSetPrio('low');
    }, 300);
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  closeTriggers.forEach(function(el) { el.addEventListener('click', closeModal); });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // ── SUBMIT → /api/admin (action: contact) ────────────────────────────
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (errMsg) errMsg.textContent = '';

    // Validation manuelle
    var piUid = document.getElementById('cmPiUid').value;
    if (!piUid) {
      var fn = (document.getElementById('contactFirstname') || {}).value || '';
      var ln = (document.getElementById('contactLastname')  || {}).value || '';
      var em = (document.getElementById('contactEmail')     || {}).value || '';
      if (!fn.trim() || !ln.trim()) {
        if (errMsg) errMsg.textContent = 'Prénom et nom requis.';
        return;
      }
      if (!em.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        if (errMsg) errMsg.textContent = 'Email invalide.';
        return;
      }
    }

    if (!document.getElementById('contactSubject').value) {
      if (errMsg) errMsg.textContent = 'Merci de sélectionner un sujet.';
      return;
    }
    var msg = (document.getElementById('contactMessage').value || '').trim();
    if (msg.length < 10) {
      if (errMsg) errMsg.textContent = 'Message trop court (min 10 caractères).';
      return;
    }

    submitBtn.classList.add('is-loading');

    // Construire le payload JSON
    var fd = new FormData(form);
    var payload = {};
    fd.forEach(function(v, k) { if (v !== '') payload[k] = v; });

    fetch(form.action, {
      method:  'POST',
      body:    JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      submitBtn.classList.remove('is-loading');
      if (res.ok && res.data.ok) {
        form.reset();
        successMsg.hidden = false;
        submitBtn.style.display = 'none';
        setTimeout(function() {
          closeModal();
        }, 3000);
      } else {
        if (errMsg) errMsg.textContent = res.data.error || 'Erreur lors de l\'envoi.';
      }
    })
    .catch(function() {
      submitBtn.classList.remove('is-loading');
      if (errMsg) errMsg.textContent = 'Erreur réseau. Vérifie ta connexion.';
    });
  });

  // ── API publique ───────────────────────────────────────────────────────
  window.VoirAnimeContact = { open: openModal, close: closeModal };

})();

// ── Priorité (globale car appelée depuis onclick HTML) ────────────────────
function cmSetPrio(level) {
  document.querySelectorAll('.cm-prio').forEach(function(b) {
    b.className = 'cm-prio';
    if (b.getAttribute('data-prio') === level) b.classList.add('active-' + level);
  });
  var el = document.getElementById('cmPriority');
  if (el) el.value = level;
}

/* ═══════════════════════════════════════════
   CONTACT MODAL — JS (vanilla, zero deps)
   VoirAnime
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────
  const modal       = document.getElementById('footerContactModal');
  const form        = document.getElementById('contactForm');
  const submitBtn   = document.getElementById('contactSubmitBtn');
  const successMsg  = document.getElementById('contactSuccess');
  const hiddenLang  = document.getElementById('hiddenLang');
  const hiddenUrl   = document.getElementById('hiddenUrl');

  // All elements that should close the modal
  const closeTriggers = modal.querySelectorAll('[data-close-modal]');

  // The demo open button (remove in production if using your own trigger)
  const openBtn = document.getElementById('openContactBtn');

  // ── OPEN ──────────────────────────────────
  function openModal() {
    // Populate hidden fields each time modal opens
    hiddenLang.value = navigator.language || navigator.userLanguage || 'unknown';
    hiddenUrl.value  = window.location.href;

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    // Focus first interactive element after animation
    setTimeout(() => {
      const firstInput = modal.querySelector('select, input, textarea');
      if (firstInput) firstInput.focus();
    }, 350);
  }

  // ── CLOSE ─────────────────────────────────
  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // ── EVENT LISTENERS ───────────────────────

  // Open button (demo — adapt to your footer link)
  if (openBtn) {
    openBtn.addEventListener('click', openModal);
  }

  // Close triggers (backdrop + close button)
  closeTriggers.forEach(function (el) {
    el.addEventListener('click', closeModal);
  });

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  // ── FORM SUBMIT (Formspree via AJAX) ──────
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Validate required fields
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Loading state
    submitBtn.classList.add('is-loading');

    // Collect form data
    var data = new FormData(form);

    fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    })
    .then(function (response) {
      submitBtn.classList.remove('is-loading');

      if (response.ok) {
        // Show success
        form.reset();
        successMsg.hidden = false;
        submitBtn.style.display = 'none';

        // Auto-close after a few seconds
        setTimeout(function () {
          closeModal();
          // Reset success state for next opening
          setTimeout(function () {
            successMsg.hidden = true;
            submitBtn.style.display = '';
          }, 400);
        }, 3000);
      } else {
        alert('Une erreur est survenue. Réessaie dans quelques instants.');
      }
    })
    .catch(function () {
      submitBtn.classList.remove('is-loading');
      alert('Impossible d\'envoyer le message. Vérifie ta connexion.');
    });
  });

  // ── PUBLIC API (optional) ─────────────────
  // Expose open/close so other scripts can call them:
  //   window.VoirAnimeContact.open()
  //   window.VoirAnimeContact.close()
  window.VoirAnimeContact = {
    open:  openModal,
    close: closeModal
  };

})();

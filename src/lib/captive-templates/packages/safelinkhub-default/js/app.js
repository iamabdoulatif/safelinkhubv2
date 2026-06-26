/* ============================================================
   ZENFI HOTSPOT PORTAL - APPLICATION JAVASCRIPT
   Auteur: Full Stack Expert
   Version: 1.0.0
   Compatible: MikroTik RouterOS Hotspot
   Contraintes: ES6+, aucune dépendance externe
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. UTILITAIRES
     ---------------------------------------------------------- */
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => context.querySelectorAll(selector);
  const on = (el, event, handler) => el && el.addEventListener(event, handler);

  /* ----------------------------------------------------------
     2. DETECTION MODE SOMBRE
     ---------------------------------------------------------- */
  function initDarkMode() {
    const saved = localStorage.getItem('zenfi-theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark-mode');
    }

    // Bouton toggle (si présent dans la page)
    const toggleBtn = $('#theme-toggle');
    if (toggleBtn) {
      on(toggleBtn, 'click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('zenfi-theme', isDark ? 'dark' : 'light');
      });
    }
  }

  /* ----------------------------------------------------------
     3. VALIDATION FORMULAIRE LOGIN
     ---------------------------------------------------------- */
  function initLoginForm() {
    const form = $('#login-form');
    if (!form) return;

    const input = $('#username');
    const btn = $('#submit-btn');
    const errorBox = $('#form-error');

    // Efface l'erreur lors de la saisie
    if (input) {
      on(input, 'input', () => {
        input.classList.remove('error');
        if (errorBox) errorBox.classList.add('hidden');
      });

      on(input, 'focus', () => {
        input.classList.remove('error');
      });
    }

    on(form, 'submit', (e) => {
      const value = input ? input.value.trim() : '';

      if (!value) {
        e.preventDefault();
        input.classList.add('error');
        input.focus();
        showError('Veuillez entrer votre code d\'accès.');
        return false;
      }

      // Minimum 3 caractères (code voucher typique)
      if (value.length < 3) {
        e.preventDefault();
        input.classList.add('error');
        showError('Le code d\'accès est trop court.');
        return false;
      }

      // Active le loader
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loader"></span> Connexion en cours...';
      }

      // Cache l'erreur précédente
      if (errorBox) errorBox.classList.add('hidden');

      // Le formulaire est soumis normalement vers RouterOS
      return true;
    });

    function showError(msg) {
      if (!errorBox) return;
      errorBox.innerHTML = `
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${escapeHtml(msg)}</span>
      `;
      errorBox.classList.remove('hidden');
    }
  }

  /* ----------------------------------------------------------
     4. ANIMATIONS D'APPARITION (SCROLL)
     ---------------------------------------------------------- */
  function initScrollAnimations() {
    const animatedElements = $$('.animate-fade-in');
    if (!animatedElements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    animatedElements.forEach(el => observer.observe(el));
  }

  /* ----------------------------------------------------------
     5. BOUTONS ACHETER FORFAITS
     ---------------------------------------------------------- */
  function initPlanButtons() {
    const buttons = $$('.plan-btn');
    buttons.forEach(btn => {
      on(btn, 'click', (e) => {
        e.preventDefault();
        const plan = btn.dataset.plan || 'ce forfait';
        const price = btn.dataset.price || '';

        // Redirection vers page de paiement ou ouverture de modal
        // Par défaut, on affiche une alerte élégante
        showToast(`Pour acheter ${plan} ${price}, contactez le support via WhatsApp.`);
      });
    });
  }

  /* ----------------------------------------------------------
     6. DERNIER TICKET STOCKE (login.html)
     ---------------------------------------------------------- */
  function initLastTicket() {
    const section = $('#last-ticket-section');
    const codeEl = $('#last-ticket-code');
    const useBtn = $('#use-last-ticket-btn');
    const clearBtn = $('#clear-last-ticket-btn');
    const input = $('#username');

    if (!section || !codeEl) return;

    let ticket = '';
    try {
      ticket = localStorage.getItem('safelinkhub_last_ticket') || '';
    } catch(e) {}

    if (ticket && ticket.length > 1) {
      codeEl.textContent = ticket;
      section.classList.remove('hidden-section');
      section.style.display = 'block';
    }

    if (useBtn && input) {
      on(useBtn, 'click', () => {
        input.value = ticket;
        input.focus();
        input.classList.remove('error');
        const errorBox = $('#form-error');
        if (errorBox) errorBox.classList.add('hidden');
        showToast('Ticket restauré. Cliquez sur Connexion.');
      });
    }

    if (clearBtn) {
      on(clearBtn, 'click', () => {
        try { localStorage.removeItem('safelinkhub_last_ticket'); } catch(e) {}
        section.style.display = 'none';
        showToast('Ticket oublié.');
      });
    }
  }

  /* ----------------------------------------------------------
     7. RETROUVER MON CODE -> AFFICHER VENDEURS
     ---------------------------------------------------------- */
  function initRecoverCode() {
    const recoverBtn = $('#recover-code-btn');
    const vendorsSection = $('#vendors-section');
    if (!recoverBtn) return;

    on(recoverBtn, 'click', (e) => {
      e.preventDefault();
      if (vendorsSection) {
        const isHidden = vendorsSection.style.display === 'none' || vendorsSection.classList.contains('hidden-section');
        if (isHidden) {
          vendorsSection.style.display = 'block';
          vendorsSection.classList.remove('hidden-section');
          vendorsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          vendorsSection.style.display = 'none';
        }
      }
    });
  }

  /* ----------------------------------------------------------
     8. TOAST / NOTIFICATIONS
     ---------------------------------------------------------- */
  function showToast(message, duration = 4000) {
    // Supprime les anciens toasts
    const existing = $('.zenfi-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'zenfi-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <span>${escapeHtml(message)}</span>
    `;

    // Styles inline pour le toast (pas de dépendance CSS externe)
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-card, #1e293b);
      color: var(--text-primary, #f8fafc);
      border: 1px solid var(--border-color, #334155);
      padding: 14px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
      font-weight: 500;
      z-index: 10000;
      max-width: 90vw;
      width: max-content;
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
      opacity: 0;
      pointer-events: none;
    `;

    document.body.appendChild(toast);

    // Animation d'entrée
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Disparition
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  /* ----------------------------------------------------------
     8. UTILITAIRES SECURITE
     ---------------------------------------------------------- */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ----------------------------------------------------------
     9. COMPTEUR / TIMER (pour status.html)
     ---------------------------------------------------------- */
  function initStatusTimer() {
    const timerEl = $('#session-timer');
    if (!timerEl) return;

    let seconds = parseInt(timerEl.dataset.seconds, 10) || 0;

    function formatTime(totalSeconds) {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    setInterval(() => {
      seconds++;
      timerEl.textContent = formatTime(seconds);
    }, 1000);
  }

  /* ----------------------------------------------------------
     10. AUTO-FOCUS CHAMP LOGIN
     ---------------------------------------------------------- */
  function initAutoFocus() {
    const input = $('#username');
    if (input && !input.value) {
      setTimeout(() => input.focus(), 300);
    }
  }

  /* ----------------------------------------------------------
     11. HORLOGE EN TEMPS RÉEL (optionnel)
     ---------------------------------------------------------- */
  function initClock() {
    const clockEl = $('#live-clock');
    if (!clockEl) return;

    function update() {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    update();
    setInterval(update, 1000);
  }

  /* ----------------------------------------------------------
     12. INITIALISATION GLOBALE
     ---------------------------------------------------------- */
  function init() {
    initDarkMode();
    initLoginForm();
    initScrollAnimations();
    initPlanButtons();
    initLastTicket();
    initRecoverCode();
    initStatusTimer();
    initAutoFocus();
    initClock();

    // Log de débogage (visible dans la console)
    console.log('%c {{SSID}} Hotspot Portal ', 'background: #10b981; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
    console.log('Version 2.0.0 | Mode:', document.body.classList.contains('dark-mode') ? 'Sombre' : 'Clair');
  }

  // Lance l'initialisation quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

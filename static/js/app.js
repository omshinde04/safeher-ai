// ==========================================================================
// SAFEHER AI - MAIN CONTROLLER, PWA LIFECYCLE & CONTACTS MANAGEMENT
// ==========================================================================

const App = {
  deferredPrompt: null,
  currentUser: null,

  init() {
    this.registerServiceWorker();
    this.setupNavigation();
    this.setupPWAInstall();
    this.loadUserProfile();
    this.loadContacts();
    this.loadSOSHistory();
    this.setupContactsHandlers();
    this.setupLogout();
  },

  // 1. Service Worker Registration
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch((err) => console.warn('[PWA] Service Worker registration failed:', err));
      });
    }
  },

  // 2. Tab Navigation
  setupNavigation() {
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    const tabs = document.querySelectorAll('.view-tab');

    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTabId = item.getAttribute('data-tab');

        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');

        tabs.forEach((t) => {
          if (t.id === targetTabId) {
            t.classList.add('active');
          } else {
            t.classList.remove('active');
          }
        });

        // Trigger map invalidate if switching to map
        if (targetTabId === 'tab-map' && typeof SafeMap !== 'undefined' && SafeMap.map) {
          setTimeout(() => {
            SafeMap.map.invalidateSize();
            SafeMap.locateUser();
          }, 100);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  },

  // 3. PWA Add to Home Screen Prompt
  setupPWAInstall() {
    const btnInstall = document.getElementById('btn-install-pwa');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
        btnInstall.addEventListener('click', async () => {
          if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const choiceResult = await this.deferredPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
              console.log('[PWA] User accepted installation');
            }
            this.deferredPrompt = null;
            btnInstall.style.display = 'none';
          }
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] SafeHer AI installed successfully');
      if (btnInstall) btnInstall.style.display = 'none';
    });
  },

  // 4. Load Current User Profile
  async loadUserProfile() {
    try {
      const resp = await fetch('/api/auth/me');
      const data = await resp.json();

      if (data.authenticated && data.user) {
        this.currentUser = data.user;
        const nameEl = document.getElementById('user-display-name');
        const codeEl = document.getElementById('guardian-code-display');
        const linkInput = document.getElementById('guardian-link-input');

        if (nameEl) nameEl.innerText = data.user.name;
        if (codeEl) codeEl.innerText = data.user.guardian_code;
        if (linkInput) {
          linkInput.value = `${window.location.origin}/guardian/${data.user.guardian_code}`;
        }
      } else {
        window.location.href = '/login';
      }
    } catch (e) {
      console.warn('[App] Could not fetch profile:', e);
    }
  },

  // 5. Emergency Contacts Management
  async loadContacts() {
    const container = document.getElementById('contacts-list');
    const countBadge = document.getElementById('contacts-count-badge');
    if (!container) return;

    try {
      const resp = await fetch('/api/contacts');
      const data = await resp.json();

      container.innerHTML = '';
      if (countBadge) countBadge.innerText = `${data.count} / ${data.max}`;

      if (data.contacts && data.contacts.length > 0) {
        data.contacts.forEach((c) => {
          const card = document.createElement('div');
          card.className = 'contact-card';
          card.innerHTML = `
            <div class="contact-meta">
              <h4>${c.name} <span style="font-size:11px; color:#00f2fe; font-weight:normal;">(${c.relation})</span></h4>
              <p>📞 ${c.phone} ${c.email ? '• ✉️ ' + c.email : ''}</p>
            </div>
            <button class="btn-remove-contact" data-id="${c.id}" title="Remove Contact">🗑️</button>
          `;
          container.appendChild(card);
        });

        // Bind delete buttons
        container.querySelectorAll('.btn-remove-contact').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const cid = e.currentTarget.getAttribute('data-id');
            if (confirm('Are you sure you want to remove this emergency contact?')) {
              await fetch(`/api/contacts/${cid}`, { method: 'DELETE' });
              this.loadContacts();
            }
          });
        });
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding:16px; color:#64748b; font-size:13px;">
            No trusted contacts saved yet. Add up to 5 guardians who will receive your SOS alerts.
          </div>
        `;
      }
    } catch (e) {
      console.error('[App] Failed to load contacts:', e);
    }
  },

  setupContactsHandlers() {
    const btnAdd = document.getElementById('btn-add-contact');
    const modal = document.getElementById('add-contact-modal');
    const btnCloseModal = document.getElementById('btn-close-contact-modal');
    const form = document.getElementById('form-add-contact');

    if (btnAdd && modal) {
      btnAdd.addEventListener('click', () => { modal.style.display = 'flex'; });
    }

    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => { modal.style.display = 'none'; });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('contact-name').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        const email = document.getElementById('contact-email').value.trim();
        const relation = document.getElementById('contact-relation').value.trim();

        try {
          const resp = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, email, relation })
          });
          const res = await resp.json();
          if (res.success) {
            form.reset();
            modal.style.display = 'none';
            this.loadContacts();
          } else {
            alert(res.error || 'Failed to add contact');
          }
        } catch (err) {
          alert('Error adding contact. Please try again.');
        }
      });
    }

    // Copy Guardian link
    const btnCopy = document.getElementById('btn-copy-guardian-link');
    const linkInput = document.getElementById('guardian-link-input');
    if (btnCopy && linkInput) {
      btnCopy.addEventListener('click', () => {
        linkInput.select();
        navigator.clipboard.writeText(linkInput.value);
        btnCopy.innerText = 'Copied!';
        setTimeout(() => { btnCopy.innerText = 'Copy Link'; }, 2000);
      });
    }
  },

  // 6. SOS History
  async loadSOSHistory() {
    const listEl = document.getElementById('sos-history-list');
    if (!listEl) return;

    try {
      const resp = await fetch('/api/sos/history');
      const data = await resp.json();

      listEl.innerHTML = '';
      if (data.history && data.history.length > 0) {
        data.history.forEach((h) => {
          const item = document.createElement('div');
          item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:8px; font-size:12px;';
          item.innerHTML = `
            <div>
              <span style="font-weight:700; color:#ff0055;">🚨 ${h.trigger_type.toUpperCase()}</span>
              <div style="color:#64748b; font-size:11px;">${h.timestamp}</div>
            </div>
            <div style="text-align:right;">
              <span style="padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; background:${h.status === 'active' ? '#ff0055' : '#10b981'}; color:#fff;">
                ${h.status.toUpperCase()}
              </span>
              <div style="font-family:monospace; color:#94a3b8; font-size:11px; margin-top:2px;">Battery: ${h.battery_level}%</div>
            </div>
          `;
          listEl.appendChild(item);
        });
      } else {
        listEl.innerHTML = `<div style="text-align:center; padding:12px; color:#64748b; font-size:12px;">No SOS incidents logged yet. System is active & clear.</div>`;
      }
    } catch (e) {
      console.warn('[App] Could not load SOS history:', e);
    }
  },

  // 7. Logout
  setupLogout() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        if (confirm('Log out from SafeHer AI on this device?')) {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }
      });
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());

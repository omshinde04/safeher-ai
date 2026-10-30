// ==========================================================================
// SAFEHER AI - MAIN CONTROLLER, PWA LIFECYCLE & CONTACTS MANAGEMENT
// ==========================================================================

const App = {
  deferredPrompt: null,
  currentUser: null,

  init() {
    this.handleSplashScreen();
    this.registerServiceWorker();
    this.setupNavigation();
    this.setupPWAInstall();
    this.loadUserProfile();
    this.loadContacts();
    this.loadSOSHistory();
    this.setupProfileHandlers();
    this.setupContactsHandlers();
    this.setupLogout();
  },

  handleSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    // Realistic native app splash experience
    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        splash.style.display = 'none';
      }, 500);
    }, 900);
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

        // Trigger map refresh if switching to map
        if (targetTabId === 'tab-map' && typeof SafeMap !== 'undefined') {
          SafeMap.refreshMap();
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

        const profileName = document.getElementById('profile-name-val');
        const profileEmail = document.getElementById('profile-email-val');
        const profilePhone = document.getElementById('profile-phone-val');
        const profileLetter = document.getElementById('profile-avatar-letter');

        if (nameEl) nameEl.innerText = data.user.name;
        if (codeEl) codeEl.innerText = data.user.guardian_code;
        if (linkInput) {
          linkInput.value = `${window.location.origin}/guardian/${data.user.guardian_code}`;
        }

        if (profileName) profileName.innerText = data.user.name;
        if (profileEmail) profileEmail.innerText = data.user.email;
        if (profilePhone) profilePhone.innerText = data.user.phone ? `📞 +91 ${data.user.phone}` : '📞 Not provided';
        if (profileLetter) profileLetter.innerText = (data.user.name || 'U').charAt(0).toUpperCase();

        // Populate edit modal fields
        const editName = document.getElementById('edit-profile-name');
        const editPhone = document.getElementById('edit-profile-phone');
        const editEmail = document.getElementById('edit-profile-email');
        if (editName) editName.value = data.user.name || '';
        if (editPhone) editPhone.value = data.user.phone || '';
        if (editEmail) editEmail.value = data.user.email || '';

        // Sync user battery state if not using hardware API
        if (data.user.last_battery_level && typeof SafeHerBattery !== 'undefined' && !SafeHerBattery.hasHardwareAPI) {
          if (!localStorage.getItem('safeher_device_battery')) {
            SafeHerBattery.setLevel(data.user.last_battery_level);
          }
        }
      } else {
        window.location.href = '/login';
      }
    } catch (e) {
      console.warn('[App] Could not fetch profile:', e);
    }
  },

  // Setup Profile Edit Modal & API Handlers
  setupProfileHandlers() {
    const btnOpen = document.getElementById('btn-open-edit-profile');
    const modal = document.getElementById('edit-profile-modal');
    const btnClose = document.getElementById('btn-close-profile-modal');
    const btnCloseX = document.getElementById('btn-close-profile-modal-x');
    const form = document.getElementById('form-edit-profile');
    const msgEl = document.getElementById('profile-edit-msg');
    const submitBtn = document.getElementById('btn-submit-profile-edit');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      if (msgEl) { msgEl.style.display = 'none'; msgEl.innerText = ''; }
      const currPass = document.getElementById('edit-profile-curr-pass');
      const newPass = document.getElementById('edit-profile-new-pass');
      if (currPass) currPass.value = '';
      if (newPass) newPass.value = '';
    };

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', () => {
        if (this.currentUser) {
          const editName = document.getElementById('edit-profile-name');
          const editPhone = document.getElementById('edit-profile-phone');
          const editEmail = document.getElementById('edit-profile-email');
          if (editName) editName.value = this.currentUser.name || '';
          if (editPhone) editPhone.value = this.currentUser.phone || '';
          if (editEmail) editEmail.value = this.currentUser.email || '';
        }
        modal.style.display = 'flex';
      });
    }

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCloseX) btnCloseX.addEventListener('click', closeModal);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('edit-profile-name').value.trim();
        const phone = document.getElementById('edit-profile-phone').value.trim();
        const current_password = document.getElementById('edit-profile-curr-pass').value;
        const new_password = document.getElementById('edit-profile-new-pass').value;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerText = 'Saving...';
        }

        try {
          const resp = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, current_password, new_password })
          });
          const res = await resp.json();

          if (resp.ok && res.success) {
            if (msgEl) {
              msgEl.style.display = 'block';
              msgEl.style.background = 'rgba(16, 185, 129, 0.2)';
              msgEl.style.color = '#10b981';
              msgEl.style.border = '1px solid #10b981';
              msgEl.innerText = '✓ Profile updated successfully!';
            }
            this.currentUser = res.user;
            await this.loadUserProfile();
            setTimeout(() => { closeModal(); }, 800);
          } else {
            if (msgEl) {
              msgEl.style.display = 'block';
              msgEl.style.background = 'rgba(255, 0, 85, 0.2)';
              msgEl.style.color = '#ff0055';
              msgEl.style.border = '1px solid #ff0055';
              msgEl.innerText = res.error || 'Failed to update profile.';
            }
          }
        } catch (err) {
          if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.style.background = 'rgba(255, 0, 85, 0.2)';
            msgEl.style.color = '#ff0055';
            msgEl.style.border = '1px solid #ff0055';
            msgEl.innerText = 'Network error while updating profile.';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Changes';
          }
        }
      });
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
              <h4>${c.name} <span class="relation-badge">${c.relation}</span></h4>
              <p>📞 ${c.phone} ${c.email ? '• ✉️ ' + c.email : ''}</p>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn-edit-contact" data-id="${c.id}" data-name="${encodeURIComponent(c.name)}" data-phone="${c.phone}" data-email="${c.email || ''}" data-relation="${c.relation}" title="Edit Guardian">✏️ Edit</button>
              <button class="btn-remove-contact" data-id="${c.id}" title="Remove Contact">🗑️</button>
            </div>
          `;
          container.appendChild(card);
        });

        // Bind Edit buttons
        container.querySelectorAll('.btn-edit-contact').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            const cid = el.getAttribute('data-id');
            const name = decodeURIComponent(el.getAttribute('data-name') || '');
            const phone = el.getAttribute('data-phone') || '';
            const email = el.getAttribute('data-email') || '';
            const relation = el.getAttribute('data-relation') || 'Guardian';

            document.getElementById('edit-contact-id').value = cid;
            document.getElementById('edit-contact-name').value = name;
            document.getElementById('edit-contact-phone').value = phone;
            document.getElementById('edit-contact-email').value = email;
            document.getElementById('edit-contact-relation').value = relation;

            const modal = document.getElementById('edit-contact-modal');
            if (modal) modal.style.display = 'flex';
          });
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
    // Add Contact
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

    // Edit Contact
    const editModal = document.getElementById('edit-contact-modal');
    const btnCloseEditModal = document.getElementById('btn-close-edit-contact-modal');
    const btnCloseEditX = document.getElementById('btn-close-edit-contact-x');
    const editForm = document.getElementById('form-edit-contact');
    const editMsgEl = document.getElementById('contact-edit-msg');
    const editSubmitBtn = document.getElementById('btn-submit-edit-contact');

    const closeEditContactModal = () => {
      if (editModal) editModal.style.display = 'none';
      if (editMsgEl) { editMsgEl.style.display = 'none'; editMsgEl.innerText = ''; }
    };

    if (btnCloseEditModal) btnCloseEditModal.addEventListener('click', closeEditContactModal);
    if (btnCloseEditX) btnCloseEditX.addEventListener('click', closeEditContactModal);

    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cid = document.getElementById('edit-contact-id').value;
        const name = document.getElementById('edit-contact-name').value.trim();
        const phone = document.getElementById('edit-contact-phone').value.trim();
        const email = document.getElementById('edit-contact-email').value.trim();
        const relation = document.getElementById('edit-contact-relation').value.trim();

        if (editSubmitBtn) {
          editSubmitBtn.disabled = true;
          editSubmitBtn.innerText = 'Saving...';
        }

        try {
          const resp = await fetch(`/api/contacts/${cid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, email, relation })
          });
          const res = await resp.json();

          if (resp.ok && res.success) {
            closeEditContactModal();
            this.loadContacts();
          } else {
            if (editMsgEl) {
              editMsgEl.style.display = 'block';
              editMsgEl.style.background = 'rgba(255, 0, 85, 0.2)';
              editMsgEl.style.color = '#ff0055';
              editMsgEl.innerText = res.error || 'Failed to update contact';
            }
          }
        } catch (err) {
          if (editMsgEl) {
            editMsgEl.style.display = 'block';
            editMsgEl.style.background = 'rgba(255, 0, 85, 0.2)';
            editMsgEl.style.color = '#ff0055';
            editMsgEl.innerText = 'Network error while updating contact.';
          }
        } finally {
          if (editSubmitBtn) {
            editSubmitBtn.disabled = false;
            editSubmitBtn.innerText = 'Save Changes';
          }
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
          item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:8px; font-size:12px;';
          item.innerHTML = `
            <div>
              <span style="font-weight:700; color:#dc2626;">🚨 ${h.trigger_type.toUpperCase()}</span>
              <div style="color:#64748b; font-size:11px; margin-top:2px;">${h.timestamp}</div>
            </div>
            <div style="text-align:right;">
              <span style="padding:3px 9px; border-radius:12px; font-size:10px; font-weight:700; background:${h.status === 'active' ? '#ef4444' : '#10b981'}; color:#ffffff;">
                ${h.status.toUpperCase()}
              </span>
              <div style="font-family:var(--font-mono); color:#64748b; font-size:11px; margin-top:3px; font-weight:600;">Battery: ${h.battery_level}%</div>
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

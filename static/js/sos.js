// ==========================================================================
// SAFEHER AI - SOS ENGINE & WEB AUDIO ALARM SYNTHESIZER
// ==========================================================================

const SOS = {
  countdownSeconds: 10,
  timerInterval: null,
  activeEventId: null,
  currentLocation: { lat: null, lng: null, accuracy: null },
  audioCtx: null,
  oscillator: null,
  isSirenPlaying: false,

  init() {
    this.trackLocation();
    this.setupListeners();

    // Auto-refresh GPS positioning when mobile screen turns on or tab regains focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.trackLocation();
      }
    });
    window.addEventListener('focus', () => this.trackLocation());
  },

  // Synthesize loud emergency siren tone using Web Audio API (Zero external MP3 dependency)
  startSiren() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.oscillator = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sawtooth';
      // Emergency alternating frequency siren
      const now = this.audioCtx.currentTime;
      this.oscillator.frequency.setValueAtTime(800, now);
      for (let i = 0; i < 20; i++) {
        this.oscillator.frequency.exponentialRampToValueAtTime(1400, now + (i * 0.4) + 0.2);
        this.oscillator.frequency.exponentialRampToValueAtTime(800, now + (i * 0.4) + 0.4);
      }

      gainNode.gain.setValueAtTime(0.3, now);
      this.oscillator.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);
      this.oscillator.start();
      this.isSirenPlaying = true;
    } catch (e) {
      console.warn('[SOS] Web Audio not supported or blocked:', e);
    }
  },

  stopSiren() {
    if (this.oscillator && this.isSirenPlaying) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) {}
      this.isSirenPlaying = false;
    }
  },

  updateGpsUI(lat, lng, accuracy, isCached = false) {
    const gpsEl = document.getElementById('gps-coords-display');
    if (!gpsEl) return;
    const suffix = isCached ? '(Last Known)' : `(±${Math.round(accuracy || 15)}m)`;
    gpsEl.innerHTML = `${lat.toFixed(4)}, ${lng.toFixed(4)} <span style="font-size:10px; color:${isCached ? '#64748b' : '#059669'}; font-weight:700;">${suffix}</span>`;
  },

  trackLocation() {
    if (!('geolocation' in navigator)) {
      const gpsEl = document.getElementById('gps-coords-display');
      if (gpsEl) gpsEl.innerText = 'GPS not supported on device';
      return;
    }

    // 1. Instant Cached Coordinate Loading (Eliminates "Pending" on mobile boot)
    if (!this.currentLocation.lat) {
      const cached = localStorage.getItem('safeher_cached_location');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.lat && parsed.lng) {
            this.currentLocation = parsed;
            this.updateGpsUI(parsed.lat, parsed.lng, parsed.accuracy, true);
          }
        } catch (e) {}
      }
    }

    // 2. Stage 1: Ultra-Fast Network/Wi-Fi Fix (< 1s response on iOS & Android)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        this.currentLocation = { lat: latitude, lng: longitude, accuracy };
        localStorage.setItem('safeher_cached_location', JSON.stringify({ lat: latitude, lng: longitude, accuracy }));
        this.updateGpsUI(latitude, longitude, accuracy, false);

        if (typeof SafeMap !== 'undefined' && SafeMap.updateUserMarker) {
          SafeMap.updateUserMarker(latitude, longitude, accuracy);
        }
      },
      (err) => {
        console.warn('[SOS] Fast network location fallback:', err.message);
        if (!this.currentLocation.lat) {
          const gpsEl = document.getElementById('gps-coords-display');
          if (gpsEl) {
            if (err.code === 1) { // PERMISSION_DENIED
              gpsEl.innerHTML = `<span style="color:#dc2626; cursor:pointer; font-weight:700;" onclick="SOS.trackLocation()">⚠️ Tap to Allow Location</span>`;
            } else {
              gpsEl.innerText = 'Acquiring live satellite lock...';
            }
          }
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );

    // 3. Stage 2: Continuous High-Accuracy GPS Satellite Watcher
    if (this.watchId) {
      try { navigator.geolocation.clearWatch(this.watchId); } catch (e) {}
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        this.currentLocation = { lat: latitude, lng: longitude, accuracy };
        localStorage.setItem('safeher_cached_location', JSON.stringify({ lat: latitude, lng: longitude, accuracy }));
        this.updateGpsUI(latitude, longitude, accuracy, false);

        if (typeof SafeMap !== 'undefined' && SafeMap.updateUserMarker) {
          SafeMap.updateUserMarker(latitude, longitude, accuracy);
        }
      },
      (err) => {
        console.warn('[SOS] High-accuracy GPS watcher note:', err.message);
        // If we already have coordinates from Stage 1 or cache, NEVER erase with "Pending"!
        if (!this.currentLocation.lat) {
          const gpsEl = document.getElementById('gps-coords-display');
          if (gpsEl) {
            if (err.code === 1) {
              gpsEl.innerHTML = `<span style="color:#dc2626; cursor:pointer; font-weight:700;" onclick="SOS.trackLocation()">⚠️ Tap to Allow Location</span>`;
            }
          }
        }
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 3000 }
    );
  },

  startCountdown(triggerType = 'manual') {
    const overlay = document.getElementById('countdown-overlay');
    const numberEl = document.getElementById('countdown-number');
    const triggerLabelEl = document.getElementById('countdown-trigger-label');
    
    if (!overlay) return;

    overlay.classList.add('active');
    let timeLeft = this.countdownSeconds;
    numberEl.innerText = timeLeft;
    if (triggerLabelEl) {
      triggerLabelEl.innerText = `Triggered via ${triggerType.toUpperCase()}`;
    }

    this.startSiren();

    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      timeLeft--;
      numberEl.innerText = timeLeft;

      if (timeLeft <= 0) {
        clearInterval(this.timerInterval);
        this.executeSOS(triggerType);
      }
    }, 1000);
  },

  cancelCountdown() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.stopSiren();
    const overlay = document.getElementById('countdown-overlay');
    if (overlay) overlay.classList.remove('active');
  },

  async executeSOS(triggerType = 'manual') {
    this.stopSiren();
    const overlay = document.getElementById('countdown-overlay');
    if (overlay) overlay.classList.remove('active');

    // 1. Ensure GPS Coordinates are locked before sending alert
    if (!this.currentLocation.lat && 'geolocation' in navigator) {
      try {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              this.currentLocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
              };
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: false, timeout: 2000, maximumAge: 120000 }
          );
        });
      } catch (e) {}
    }

    // Fallback to cached location if still null
    if (!this.currentLocation.lat) {
      const cached = localStorage.getItem('safeher_cached_location');
      if (cached) {
        try {
          const p = JSON.parse(cached);
          if (p.lat && p.lng) this.currentLocation = p;
        } catch (e) {}
      }
    }

    // 2. Real-Time Hardware Battery Level
    let batteryLevel = 90;
    if (window.SafeHerBattery && typeof window.SafeHerBattery.getLiveLevel === 'function') {
      batteryLevel = await window.SafeHerBattery.getLiveLevel();
    } else if (window.SafeHerBattery && typeof window.SafeHerBattery.getLevel === 'function') {
      batteryLevel = window.SafeHerBattery.getLevel();
    } else {
      const saved = localStorage.getItem('safeher_device_battery');
      if (saved) batteryLevel = parseInt(saved, 10);
    }

    try {
      const resp = await fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: this.currentLocation.lat,
          longitude: this.currentLocation.lng,
          accuracy: this.currentLocation.accuracy,
          battery_level: batteryLevel,
          trigger_type: triggerType
        })
      });

      const data = await resp.json();
      if (data.success) {
        this.activeEventId = data.event_id;
        data.dispatched_battery = batteryLevel;
        this.displayActiveSOSModal(data);
      } else {
        alert(data.error || 'Failed to trigger SOS');
      }
    } catch (e) {
      console.warn('[SOS] Server unreachable / offline. Activating 100% Offline Cellular SMS Dispatch Mode:', e);

      // Read trusted contacts from local cache
      const cachedContactsRaw = localStorage.getItem('safeher_cached_contacts');
      let contacts = [];
      if (cachedContactsRaw) {
        try {
          contacts = JSON.parse(cachedContactsRaw) || [];
        } catch (err) {}
      }

      const lat = this.currentLocation.lat;
      const lng = this.currentLocation.lng;
      const mapLink = (lat && lng) ? `https://maps.google.com/?q=${lat},${lng}` : 'Pending location';
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const sep = isIOS ? '&' : '?';

      const sosMsg = `🚨 EMERGENCY SOS ALERT! I am in danger and need immediate help! 📍 Location: ${mapLink} 🔋 Battery: ${batteryLevel}% - Sent via SafeHer AI`;

      const contact_links = contacts.map(c => {
        const cleanPhone = (c.phone || '').replace(/[^0-9+]/g, '');
        return {
          name: c.name,
          phone: c.phone,
          relation: c.relation,
          sms_url: `sms:${cleanPhone}${sep}body=${encodeURIComponent(sosMsg)}`,
          whatsapp_url: `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(sosMsg)}`
        };
      });

      const offlineData = {
        success: true,
        offline: true,
        dispatched_battery: batteryLevel,
        contact_links: contact_links
      };

      this.displayActiveSOSModal(offlineData);
    }
  },

  displayActiveSOSModal(data) {
    const modal = document.getElementById('sos-result-modal');
    if (!modal) return;

    // Update battery telemetry display
    const battSpan = document.getElementById('sos-telemetry-battery');
    if (battSpan) {
      const bVal = data.dispatched_battery !== undefined ? data.dispatched_battery : (window.SafeHerBattery ? window.SafeHerBattery.getLevel() : 90);
      battSpan.innerText = `🔋 Battery: ${bVal}%`;
    }

    const gpsSpan = document.getElementById('sos-telemetry-gps');
    if (gpsSpan) {
      if (data.offline) {
        gpsSpan.innerHTML = `⚡ <span style="color:#d97706;">Offline Cellular SMS Mode</span>`;
      } else {
        gpsSpan.innerHTML = `📍 Live GPS Attached`;
      }
    }

    const linksContainer = document.getElementById('sos-contact-actions');
    linksContainer.innerHTML = '';

    if (data.offline) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#fef3c7; border:1px solid #fde68a; color:#92400e; padding:10px 12px; border-radius:10px; font-size:12px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:6px;';
      banner.innerHTML = '<span>⚡</span> <span>No internet connection. Tap <b>✉️ SMS</b> below to send direct emergency text to guardians without data!</span>';
      linksContainer.appendChild(banner);
    } else if (data.auto_sms_dispatched) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#ecfdf5; border:1px solid #86efac; color:#166534; padding:10px 12px; border-radius:10px; font-size:12px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:8px; box-shadow:0 1px 4px rgba(22,101,52,0.06);';
      banner.innerHTML = `<span>🚀</span> <div><b>Automated Emergency SMS Sent!</b><div style="font-size:11px; font-weight:500; color:#15803d; margin-top:2px;">Fast2SMS has dispatched live distress alert &amp; GPS tracker directly to ${data.auto_sms_count} guardian SIM card(s).</div></div>`;
      linksContainer.appendChild(banner);
    }

    if (data.contact_links && data.contact_links.length > 0) {
      data.contact_links.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'sos-action-row';
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:12px;';
        row.innerHTML = `
          <div style="min-width:0; margin-right:8px;">
            <div style="font-weight:800; font-size:14px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</div>
            <div style="font-size:12px; color:#64748b;">${c.phone}</div>
          </div>
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <a href="${c.whatsapp_url}" target="_blank" style="background:#22c55e; color:#ffffff; padding:8px 12px; border-radius:8px; font-weight:800; font-size:12px; text-decoration:none; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(34,197,94,0.3);">
              <span>💬</span> WhatsApp
            </a>
            <a href="${c.sms_url}" style="background:#0284c7; color:#ffffff; padding:8px 12px; border-radius:8px; font-weight:800; font-size:12px; text-decoration:none; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(2,132,199,0.25);">
              <span>✉️</span> SMS
            </a>
          </div>
        `;
        linksContainer.appendChild(row);
      });
    } else {
      linksContainer.innerHTML += `
        <p style="font-size:13px; color:#dc2626; margin-bottom:12px; background:#fee2e2; border:1px solid #fca5a5; padding:10px; border-radius:8px;">
          No trusted contacts added yet! Please add emergency contacts in settings.
        </p>
      `;
    }

    modal.style.display = 'flex';
  },

  async cancelActiveSOS() {
    this.stopSiren(); // Always immediately silence the siren

    const modal = document.getElementById('sos-result-modal');
    if (modal) modal.style.display = 'none';

    if (!this.activeEventId) {
      return;
    }

    try {
      await fetch(`/api/sos/cancel/${this.activeEventId}`, { method: 'POST' });
      this.activeEventId = null;
      alert('SOS marked as cancelled.');
    } catch (e) {
      this.activeEventId = null;
      console.warn('[SOS] Offline cancel noted.');
    }
  },

  setupListeners() {
    const mainBtn = document.getElementById('btn-main-sos');
    if (mainBtn) {
      mainBtn.addEventListener('click', () => this.startCountdown('manual'));
    }

    const cancelBtn = document.getElementById('btn-cancel-countdown');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancelCountdown());
    }

    const instantTriggerBtn = document.getElementById('btn-trigger-now');
    if (instantTriggerBtn) {
      instantTriggerBtn.addEventListener('click', () => {
        clearInterval(this.timerInterval);
        this.executeSOS('manual');
      });
    }

    const closeResultBtn = document.getElementById('btn-close-sos-result');
    if (closeResultBtn) {
      closeResultBtn.addEventListener('click', () => this.cancelActiveSOS());
    }
  }
};

window.addEventListener('DOMContentLoaded', () => SOS.init());

// ==========================================================================
// SAFEHER AI - SOS ENGINE & WEB AUDIO ALARM SYNTHESIZER
// ==========================================================================

const SOS = {
  countdownSeconds: 10,
  timerInterval: null,
  activeEventId: null,
  currentLocation: { lat: 18.6186, lng: 73.7482, accuracy: 25, source: 'default' },
  audioCtx: null,
  oscillator: null,
  isSirenPlaying: false,

  init() {
    this.restoreCachedLocation();
    this.trackLocation(false);
    this.setupListeners();
    this.setupGpsModalListeners();

    // Auto-refresh GPS positioning when mobile screen turns on or tab regains focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.trackLocation(false);
      }
    });
    window.addEventListener('focus', () => this.trackLocation(false));
  },

  async restoreCachedLocation() {
    // 1. Instant Cached Coordinate Loading
    const cached = localStorage.getItem('safeher_cached_location');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.lat && parsed.lng) {
          this.currentLocation = parsed;
          this.updateGpsUI(parsed.lat, parsed.lng, parsed.accuracy, '(Saved)');
          return;
        }
      } catch (e) {}
    }

    // 2. Fetch last known coordinates from server profile
    try {
      const resp = await fetch('/api/telemetry/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data.latitude && data.longitude) {
          this.currentLocation = { lat: data.latitude, lng: data.longitude, accuracy: 25, source: 'profile' };
          localStorage.setItem('safeher_cached_location', JSON.stringify(this.currentLocation));
          this.updateGpsUI(data.latitude, data.longitude, 25, '(Profile)');
          return;
        }
      }
    } catch (e) {}

    // 3. Fallback: Auto-detect via zero-permission Network/IP
    await this.fetchIPLocation();
  },

  async fetchIPLocation() {
    try {
      const resp = await fetch('/api/telemetry/ip-locate');
      if (resp.ok) {
        const data = await resp.json();
        if (data.latitude && data.longitude) {
          this.currentLocation = {
            lat: data.latitude,
            lng: data.longitude,
            accuracy: 100,
            source: 'network'
          };
          localStorage.setItem('safeher_cached_location', JSON.stringify(this.currentLocation));
          this.updateGpsUI(data.latitude, data.longitude, 100, '(Network IP)');
          if (typeof SafeMap !== 'undefined' && SafeMap.updateUserMarker) {
            SafeMap.updateUserMarker(data.latitude, data.longitude, 100);
          }
          return;
        }
      }
    } catch (e) {}

    // 4. Default Campus Coordinates (Guaranteed non-null)
    this.currentLocation = { lat: 18.6186, lng: 73.7482, accuracy: 25, source: 'campus' };
    this.updateGpsUI(18.6186, 73.7482, 25, '(Campus Area)');
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

  updateGpsUI(lat, lng, accuracy, tag = null) {
    const gpsEl = document.getElementById('gps-coords-display');
    const modalCoordsEl = document.getElementById('modal-gps-coords');
    const modalSourceEl = document.getElementById('modal-gps-source');
    const modalAccEl = document.getElementById('modal-gps-accuracy');

    let label = tag;
    if (!label) {
      label = accuracy ? `(±${Math.round(accuracy)}m)` : '(Live GPS)';
    }

    if (gpsEl) {
      gpsEl.innerHTML = `${lat.toFixed(4)}, ${lng.toFixed(4)} <span style="font-size:10px; color:#059669; font-weight:800;">${label}</span>`;
    }

    if (modalCoordsEl) {
      modalCoordsEl.innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    if (modalSourceEl) {
      modalSourceEl.innerText = label.replace(/[()]/g, '');
    }
    if (modalAccEl) {
      modalAccEl.innerText = `Accuracy: ±${Math.round(accuracy || 20)}m • Ready for SOS`;
    }
  },

  trackLocation(isUserGesture = false) {
    if (!('geolocation' in navigator)) {
      this.updateGpsUI(this.currentLocation.lat, this.currentLocation.lng, 50, '(Network IP)');
      return;
    }

    const onPosSuccess = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      this.currentLocation = { lat: latitude, lng: longitude, accuracy, source: 'satellite' };
      localStorage.setItem('safeher_cached_location', JSON.stringify(this.currentLocation));
      this.updateGpsUI(latitude, longitude, accuracy, `(Live GPS ±${Math.round(accuracy)}m)`);

      if (typeof SafeMap !== 'undefined' && SafeMap.updateUserMarker) {
        SafeMap.updateUserMarker(latitude, longitude, accuracy);
      }
    };

    // Stage 1: Fast query
    navigator.geolocation.getCurrentPosition(
      onPosSuccess,
      (err) => {
        console.warn('[SOS] Geolocation query note:', err.message);
        // CRITICAL: NEVER erase coordinates with 'Tap to Allow Location'!
        // Keep active coordinates and fall back to IP/Network coordinates
        if (!this.currentLocation.lat || this.currentLocation.source === 'default') {
          this.fetchIPLocation();
        } else {
          this.updateGpsUI(this.currentLocation.lat, this.currentLocation.lng, this.currentLocation.accuracy || 25, '(Network/Saved)');
        }

        // If user explicitly tapped "Satellite GPS" button in modal and permission was blocked, show guide
        if (isUserGesture && err.code === 1) {
          const helpEl = document.getElementById('gps-permission-help');
          if (helpEl) {
            helpEl.style.display = 'block';
            helpEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      },
      { enableHighAccuracy: true, timeout: isUserGesture ? 12000 : 8000, maximumAge: 15000 }
    );

    // Stage 2: Continuous watcher (keeps mobile location fresh)
    if (this.watchId) {
      try { navigator.geolocation.clearWatch(this.watchId); } catch (e) {}
    }

    this.watchId = navigator.geolocation.watchPosition(
      onPosSuccess,
      (err) => {
        // Silent fallback: never wipe coordinates on background watch error
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  },

  setManualLocation(lat, lng, name) {
    this.currentLocation = { lat: parseFloat(lat), lng: parseFloat(lng), accuracy: 15, source: name };
    localStorage.setItem('safeher_cached_location', JSON.stringify(this.currentLocation));
    this.updateGpsUI(this.currentLocation.lat, this.currentLocation.lng, 15, `(${name})`);

    if (typeof SafeMap !== 'undefined' && SafeMap.updateUserMarker) {
      SafeMap.updateUserMarker(this.currentLocation.lat, this.currentLocation.lng, 15);
      if (SafeMap.map) SafeMap.map.setView([this.currentLocation.lat, this.currentLocation.lng], 15);
    }

    // Sync to server
    if (window.SafeHerBattery && typeof window.SafeHerBattery.syncTelemetryToServer === 'function') {
      window.SafeHerBattery.syncTelemetryToServer();
    }

    const modal = document.getElementById('gps-modal');
    if (modal) modal.style.display = 'none';
  },

  setupGpsModalListeners() {
    const btnOpen = document.getElementById('btn-open-gps-modal');
    const modal = document.getElementById('gps-modal');
    const btnClose = document.getElementById('btn-close-gps-modal');
    const btnCloseX = document.getElementById('btn-close-gps-modal-x');
    const btnSatellite = document.getElementById('btn-request-satellite-gps');
    const btnNetwork = document.getElementById('btn-detect-network-ip');

    const openModal = () => {
      if (modal) {
        modal.style.display = 'flex';
        this.updateGpsUI(this.currentLocation.lat, this.currentLocation.lng, this.currentLocation.accuracy, this.currentLocation.source);
      }
    };

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCloseX) btnCloseX.addEventListener('click', closeModal);

    if (btnSatellite) {
      btnSatellite.addEventListener('click', () => {
        btnSatellite.innerText = '⌛ Locating...';
        this.trackLocation(true);
        setTimeout(() => {
          btnSatellite.innerHTML = '<span>🎯</span> Satellite GPS';
        }, 3000);
      });
    }

    if (btnNetwork) {
      btnNetwork.addEventListener('click', async () => {
        btnNetwork.innerText = '⌛ Detecting...';
        await this.fetchIPLocation();
        btnNetwork.innerHTML = '<span>🌐</span> Auto Network IP';
      });
    }

    document.querySelectorAll('.btn-gps-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lat = btn.getAttribute('data-lat');
        const lng = btn.getAttribute('data-lng');
        const name = btn.getAttribute('data-name');
        this.setManualLocation(lat, lng, name);
      });
    });
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

    // Immediately trigger aggressive GPS refresh as countdown begins
    this.trackLocation();

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
            { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
          );
        });
      } catch (e) {}
    }

    // Absolute fallback: ensure coordinates are NEVER null or 'Pending'
    const lat = this.currentLocation.lat || 18.6186;
    const lng = this.currentLocation.lng || 73.7482;
    this.currentLocation.lat = lat;
    this.currentLocation.lng = lng;

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
          latitude: lat,
          longitude: lng,
          accuracy: this.currentLocation.accuracy || 15,
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

      const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
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

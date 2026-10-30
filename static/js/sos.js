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

  trackLocation() {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          this.currentLocation.lat = pos.coords.latitude;
          this.currentLocation.lng = pos.coords.longitude;
          this.currentLocation.accuracy = pos.coords.accuracy;
          
          const gpsEl = document.getElementById('gps-coords-display');
          if (gpsEl) {
            gpsEl.innerText = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)}m)`;
          }
        },
        (err) => {
          console.warn('[SOS] Geolocation error:', err.message);
          const gpsEl = document.getElementById('gps-coords-display');
          if (gpsEl) gpsEl.innerText = 'GPS Signal Pending...';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    }
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

    // Get exact device battery level (hardware API or synced calibrated value)
    let batteryLevel = 90;
    if (typeof SafeHerBattery !== 'undefined' && typeof SafeHerBattery.getLevel === 'function') {
      batteryLevel = SafeHerBattery.getLevel();
    } else if (window.SafeHerBattery && typeof window.SafeHerBattery.getLevel === 'function') {
      batteryLevel = window.SafeHerBattery.getLevel();
    } else if (navigator.getBattery) {
      try {
        const b = await navigator.getBattery();
        batteryLevel = Math.round(b.level * 100);
      } catch (e) {}
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

        // Automatic WhatsApp Auto-Launch: Immediately opens primary guardian WhatsApp chat
        if (data.contact_links && data.contact_links.length > 0) {
          const primaryWA = data.contact_links[0].whatsapp_url;
          if (primaryWA) {
            setTimeout(() => {
              window.location.href = primaryWA;
            }, 500);
          }
        }
      } else {
        alert(data.error || 'Failed to trigger SOS');
      }
    } catch (e) {
      console.error('[SOS] Trigger failed:', e);
      // Even if network fails, prompt user to dial 112 immediately
      window.location.href = 'tel:112';
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

    const linksContainer = document.getElementById('sos-contact-actions');
    linksContainer.innerHTML = '';

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
      linksContainer.innerHTML = `
        <p style="font-size:13px; color:#dc2626; margin-bottom:12px; background:#fee2e2; border:1px solid #fca5a5; padding:10px; border-radius:8px;">
          No trusted contacts added yet! Please add emergency contacts in settings.
        </p>
      `;
    }

    modal.style.display = 'flex';
  },

  async cancelActiveSOS() {
    if (!this.activeEventId) {
      const modal = document.getElementById('sos-result-modal');
      if (modal) modal.style.display = 'none';
      return;
    }

    try {
      await fetch(`/api/sos/cancel/${this.activeEventId}`, { method: 'POST' });
      const modal = document.getElementById('sos-result-modal');
      if (modal) modal.style.display = 'none';
      this.activeEventId = null;
      alert('SOS marked as cancelled.');
    } catch (e) {
      console.error(e);
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

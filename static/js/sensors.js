// ==========================================================================
// CENTRAL DEVICE BATTERY CONTROLLER (iOS SAFARI & HARDWARE API)
// ==========================================================================
const SafeHerBattery = {
  currentLevel: 90,
  hasHardwareAPI: false,

  async init() {
    // 1. Read calibrated value from localStorage
    const saved = localStorage.getItem('safeher_device_battery');
    if (saved) {
      this.currentLevel = Math.max(1, Math.min(100, parseInt(saved, 10)));
    } else {
      this.currentLevel = 90;
      localStorage.setItem('safeher_device_battery', '90');
    }

    // 2. If hardware API is supported (Android/Chrome), read live battery
    if ('getBattery' in navigator) {
      try {
        const b = await navigator.getBattery();
        this.hasHardwareAPI = true;
        this.currentLevel = Math.round(b.level * 100);
        localStorage.setItem('safeher_device_battery', this.currentLevel.toString());

        const handleUpdate = () => {
          this.currentLevel = Math.round(b.level * 100);
          localStorage.setItem('safeher_device_battery', this.currentLevel.toString());
          this.updateUI();
        };

        b.addEventListener('levelchange', handleUpdate);
        b.addEventListener('chargingchange', handleUpdate);
      } catch (e) {
        console.warn('[Battery] Hardware API error:', e);
      }
    }

    this.updateUI();
    this.bindEvents();
  },

  setLevel(pct) {
    this.currentLevel = Math.max(1, Math.min(100, parseInt(pct, 10)));
    localStorage.setItem('safeher_device_battery', this.currentLevel.toString());
    this.updateUI();
  },

  getLevel() {
    return this.currentLevel;
  },

  updateUI() {
    const valSpan = document.getElementById('battery-val');
    const heroSpan = document.getElementById('hero-battery-val');
    const pill = document.getElementById('battery-pill');
    const banner = document.getElementById('battery-warning-banner');

    if (valSpan) valSpan.innerText = `${this.currentLevel}%`;
    if (heroSpan) heroSpan.innerText = `${this.currentLevel}%`;

    if (pill) {
      pill.style.display = 'flex';
      if (this.currentLevel <= 15) {
        pill.classList.add('low');
      } else {
        pill.classList.remove('low');
      }
    }

    if (banner) {
      banner.style.display = (this.currentLevel <= 15) ? 'flex' : 'none';
    }
  },

  bindEvents() {
    const openModal = () => {
      const modal = document.getElementById('battery-modal');
      const slider = document.getElementById('battery-modal-slider');
      const display = document.getElementById('battery-modal-display');
      if (modal && slider && display) {
        slider.value = this.currentLevel;
        display.innerText = `${this.currentLevel}%`;
        modal.classList.add('active');
      }
    };

    const pill = document.getElementById('battery-pill');
    if (pill) pill.addEventListener('click', openModal);

    const heroBtn = document.getElementById('btn-open-battery-calibrate');
    if (heroBtn) heroBtn.addEventListener('click', openModal);

    const closeModal = () => {
      const modal = document.getElementById('battery-modal');
      if (modal) modal.classList.remove('active');
    };

    const closeBtn = document.getElementById('btn-close-battery-modal');
    const closeBtnX = document.getElementById('btn-close-battery-modal-x');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeBtnX) closeBtnX.addEventListener('click', closeModal);

    const slider = document.getElementById('battery-modal-slider');
    const display = document.getElementById('battery-modal-display');
    if (slider && display) {
      slider.addEventListener('input', (e) => {
        display.innerText = `${e.target.value}%`;
      });
    }

    document.querySelectorAll('.btn-battery-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = btn.dataset.pct;
        if (slider) slider.value = pct;
        if (display) display.innerText = `${pct}%`;
      });
    });

    const saveBtn = document.getElementById('btn-save-battery-modal');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const val = slider ? slider.value : this.currentLevel;
        this.setLevel(val);
        closeModal();
      });
    }
  }
};
window.SafeHerBattery = SafeHerBattery;

const Sensors = {
  shakeEnabled: false,
  voiceEnabled: false,
  lastX: null,
  lastY: null,
  lastZ: null,
  shakeCount: 0,
  lastShakeTime: 0,
  speechRecognition: null,

  init() {
    this.initBattery();
    this.initShake();
    this.initVoice();
    this.bindToggles();
  },

  // 1. Battery Status Monitor
  async initBattery() {
    await SafeHerBattery.init();
  },

  // 2. Accelerometer Shake-to-SOS Detection
  initShake() {
    const saved = localStorage.getItem('safeher_shake_enabled');
    this.shakeEnabled = saved === 'true';
    const toggle = document.getElementById('toggle-shake');
    if (toggle) toggle.checked = this.shakeEnabled;

    if (this.shakeEnabled) {
      this.attachShakeListener();
    }
  },

  async requestMotionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const response = await DeviceMotionEvent.requestPermission();
        return response === 'granted';
      } catch (e) {
        console.warn('[Sensors] Motion permission denied:', e);
        return false;
      }
    }
    return true; // Non-iOS browsers don't need explicit prompt
  },

  attachShakeListener() {
    window.addEventListener('devicemotion', this.handleMotion.bind(this), false);
  },

  detachShakeListener() {
    window.removeEventListener('devicemotion', this.handleMotion.bind(this), false);
  },

  handleMotion(event) {
    if (!this.shakeEnabled) return;

    const current = event.accelerationIncludingGravity || event.acceleration;
    if (!current || current.x === null) return;

    const now = Date.now();

    if (this.lastX !== null) {
      const deltaX = Math.abs(current.x - this.lastX);
      const deltaY = Math.abs(current.y - this.lastY);
      const deltaZ = Math.abs(current.z - this.lastZ);

      // Linear acceleration magnitude change
      const delta = deltaX + deltaY + deltaZ;

      // Threshold: > 24 m/s² qualifies as an intentional vigorous shake
      if (delta > 24) {
        if (now - this.lastShakeTime > 250) { // debounce shakes
          this.shakeCount++;
          this.lastShakeTime = now;

          if (this.shakeCount >= 3) {
            console.log('[Sensors] Vigorous shake gesture detected!');
            this.shakeCount = 0;
            // Activate SOS
            if (typeof SOS !== 'undefined') {
              SOS.startCountdown('shake');
            }
          }
        }
      } else if (now - this.lastShakeTime > 1500) {
        // Reset shake count if idle for over 1.5s
        this.shakeCount = 0;
      }
    }

    this.lastX = current.x;
    this.lastY = current.y;
    this.lastZ = current.z;
  },

  // 3. Edge AI Voice SOS Detection ("Help" / "Madat" / "वाचवा")
  initVoice() {
    const saved = localStorage.getItem('safeher_voice_enabled');
    this.voiceEnabled = saved === 'true';
    const toggle = document.getElementById('toggle-voice');
    if (toggle) toggle.checked = this.voiceEnabled;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Sensors] Speech recognition not supported in this browser.');
      const card = document.getElementById('card-voice-toggle');
      if (card) {
        card.style.opacity = '0.5';
        card.title = 'Voice SOS not supported in this browser';
      }
      return;
    }

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = false;
    this.speechRecognition.lang = 'en-IN'; // Works well with English, Hindi & Marathi accents

    this.speechRecognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim().toLowerCase();
      console.log('[Sensors Voice Heard]:', transcript);

      // Emergency keywords
      const triggerWords = ['help', 'madat', 'bachao', 'emergency', 'वाचवा', 'मदत', 'बचाओ'];
      const matched = triggerWords.some((word) => transcript.includes(word));

      if (matched) {
        console.warn('[Sensors] Voice trigger recognized! Initiating SOS...');
        if (typeof SOS !== 'undefined') {
          SOS.startCountdown('voice');
        }
      }
    };

    this.speechRecognition.onerror = (err) => {
      console.warn('[Sensors] Speech error:', err.error);
    };

    this.speechRecognition.onend = () => {
      // Auto-restart if voice is still enabled
      if (this.voiceEnabled) {
        try {
          this.speechRecognition.start();
        } catch (e) {}
      }
    };

    if (this.voiceEnabled) {
      try {
        this.speechRecognition.start();
      } catch (e) {}
    }
  },

  bindToggles() {
    const toggleShake = document.getElementById('toggle-shake');
    if (toggleShake) {
      toggleShake.addEventListener('change', async (e) => {
        this.shakeEnabled = e.target.checked;
        localStorage.setItem('safeher_shake_enabled', this.shakeEnabled);

        if (this.shakeEnabled) {
          const granted = await this.requestMotionPermission();
          if (granted) {
            this.attachShakeListener();
          } else {
            alert('Motion sensor permission was denied.');
            e.target.checked = false;
            this.shakeEnabled = false;
          }
        } else {
          this.detachShakeListener();
        }
      });
    }

    const toggleVoice = document.getElementById('toggle-voice');
    if (toggleVoice) {
      toggleVoice.addEventListener('change', (e) => {
        this.voiceEnabled = e.target.checked;
        localStorage.setItem('safeher_voice_enabled', this.voiceEnabled);

        if (this.voiceEnabled && this.speechRecognition) {
          try {
            this.speechRecognition.start();
          } catch (e) {}
        } else if (this.speechRecognition) {
          try {
            this.speechRecognition.stop();
          } catch (e) {}
        }
      });
    }

    // Low Battery Notification Action Button
    const btnBatteryNotify = document.getElementById('btn-battery-notify');
    if (btnBatteryNotify) {
      btnBatteryNotify.addEventListener('click', async () => {
        let lat = SOS.currentLocation.lat || '';
        let lng = SOS.currentLocation.lng || '';
        let msg = `⚠️ *Low Battery Alert from SafeHer AI!*\nMy phone battery is under 15% and may switch off soon. My last known location is: https://www.google.com/maps?q=${lat},${lng}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
      });
    }
  }
};

window.addEventListener('DOMContentLoaded', () => Sensors.init());

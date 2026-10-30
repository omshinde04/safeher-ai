// ==========================================================================
// SAFEHER AI - ADVANCED JOURNEY SAFETY CHECK-IN ENGINE
// ==========================================================================

const CheckIn = {
  selectedDuration: 15,
  selectedTransport: 'walking',
  activeCheckinId: null,
  totalSecondsRemaining: 0,
  journeyInterval: null,
  challengeInterval: null,
  challengeSecondsLeft: 30,

  // Fake Call Simulator State
  fakeCallInterval: null,
  fakeCallAudioCtx: null,
  fakeCallOscillator: null,

  init() {
    this.bindEvents();
    this.loadHistory();
  },

  bindEvents() {
    // 1. Duration Buttons
    const durationBtns = document.querySelectorAll('.btn-duration');
    durationBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        durationBtns.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedDuration = parseInt(btn.getAttribute('data-mins'), 10);
      });
    });

    // 2. Transport Mode Selector
    const transportBtns = document.querySelectorAll('.btn-transport');
    const vehicleBox = document.getElementById('checkin-vehicle-box');
    transportBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        transportBtns.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedTransport = btn.getAttribute('data-mode') || 'walking';

        // Reveal vehicle input if cab or auto is selected
        if (vehicleBox) {
          if (this.selectedTransport === 'cab' || this.selectedTransport === 'auto') {
            vehicleBox.style.display = 'block';
          } else {
            vehicleBox.style.display = 'none';
          }
        }
      });
    });

    // 3. Start Journey Button
    const btnStart = document.getElementById('btn-start-checkin');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.startJourney());
    }

    // 4. Mark Safe Button
    const btnSafe = document.getElementById('btn-reached-safe');
    if (btnSafe) {
      btnSafe.addEventListener('click', () => this.markSafe());
    }

    // 5. Time Extension (+5m / +10m)
    const extendBtns = document.querySelectorAll('.btn-extend-pill');
    extendBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.getAttribute('data-extend'), 10) || 5;
        this.extendJourney(mins);
      });
    });

    // 6. Manual Escalation
    const btnEscalate = document.getElementById('btn-escalate-now');
    if (btnEscalate) {
      btnEscalate.addEventListener('click', () => {
        if (confirm('🚨 Escalate this commute to an active Emergency SOS alert?')) {
          this.escalateToSOS();
        }
      });
    }

    // 7. Safety Challenge Modal Buttons ("Are you safe?")
    const btnChallengeSafe = document.getElementById('btn-challenge-safe');
    if (btnChallengeSafe) {
      btnChallengeSafe.addEventListener('click', () => this.resolveChallengeSafe());
    }

    const btnChallengeHelp = document.getElementById('btn-challenge-help');
    if (btnChallengeHelp) {
      btnChallengeHelp.addEventListener('click', () => this.escalateToSOS());
    }

    // 8. Fake Call Escape Triggers
    const btnFakeCall = document.getElementById('btn-trigger-fake-call');
    if (btnFakeCall) {
      btnFakeCall.addEventListener('click', () => this.startFakeCallSimulation());
    }

    const btnAcceptFakeCall = document.getElementById('btn-accept-fake-call');
    if (btnAcceptFakeCall) {
      btnAcceptFakeCall.addEventListener('click', () => this.acceptFakeCall());
    }

    const btnDeclineFakeCall = document.getElementById('btn-decline-fake-call');
    if (btnDeclineFakeCall) {
      btnDeclineFakeCall.addEventListener('click', () => this.endFakeCall());
    }

    // 9. Refresh History
    const btnRefreshHist = document.getElementById('btn-refresh-checkin-history');
    if (btnRefreshHist) {
      btnRefreshHist.addEventListener('click', () => this.loadHistory());
    }
  },

  async startJourney() {
    const destInput = document.getElementById('checkin-destination');
    const destination = destInput && destInput.value.trim() ? destInput.value.trim() : 'Commute Route';
    const vehicleInput = document.getElementById('checkin-vehicle-no');
    const vehicleNo = vehicleInput && vehicleInput.value.trim() ? vehicleInput.value.trim() : '';

    const battLevel = (typeof SafeHerBattery !== 'undefined' && typeof SafeHerBattery.getLevel === 'function')
      ? SafeHerBattery.getLevel()
      : (localStorage.getItem('safeher_device_battery') ? parseInt(localStorage.getItem('safeher_device_battery'), 10) : 90);

    let lat = null;
    let lng = null;
    if (typeof SOS !== 'undefined' && SOS.currentLocation) {
      lat = SOS.currentLocation.lat;
      lng = SOS.currentLocation.lng;
    }

    try {
      const resp = await fetch('/api/checkin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_minutes: this.selectedDuration,
          destination: destination,
          transport_mode: this.selectedTransport,
          vehicle_no: vehicleNo,
          battery_level: battLevel,
          latitude: lat,
          longitude: lng
        })
      });

      const data = await resp.json();
      if (data.success) {
        this.activeCheckinId = data.checkin_id;

        // Set up WhatsApp sharing link
        const waBtn = document.getElementById('btn-share-journey-wa');
        if (waBtn && data.trip_share_url) {
          waBtn.href = data.trip_share_url;
        }

        this.showActiveJourneyUI(this.selectedDuration, destination, this.selectedTransport, vehicleNo);
        this.loadHistory();
      } else {
        alert(data.error || 'Failed to start journey timer.');
      }
    } catch (e) {
      console.warn('[CheckIn] Server unreachable; running local offline journey timer:', e);
      this.activeCheckinId = 'offline_' + Date.now();
      this.showActiveJourneyUI(this.selectedDuration, destination, this.selectedTransport, vehicleNo);
    }
  },

  showActiveJourneyUI(durationMinutes, destination, mode, vehicleNo) {
    const setupCard = document.getElementById('checkin-setup-card');
    const activeDisplay = document.getElementById('active-checkin-display');
    const destLabel = document.getElementById('active-journey-destination');
    const modeBadge = document.getElementById('active-transport-badge');
    const vehicleBadge = document.getElementById('active-vehicle-badge');

    if (setupCard) setupCard.style.display = 'none';
    if (activeDisplay) activeDisplay.style.display = 'block';
    if (destLabel) destLabel.innerText = `Heading to: ${destination}`;

    const modeIcons = { walking: '🚶 Walking', cab: '🚖 Cab / Uber', auto: '🛺 Auto', bus: '🚌 Bus / Metro' };
    if (modeBadge) modeBadge.innerText = modeIcons[mode] || '🚶 Commute';

    if (vehicleBadge) {
      if (vehicleNo) {
        vehicleBadge.style.display = 'inline-block';
        vehicleBadge.innerText = `Plate: ${vehicleNo}`;
      } else {
        vehicleBadge.style.display = 'none';
      }
    }

    this.totalSecondsRemaining = durationMinutes * 60;
    this.updateTimerDisplay(this.totalSecondsRemaining);

    if (this.journeyInterval) clearInterval(this.journeyInterval);

    this.journeyInterval = setInterval(() => {
      this.totalSecondsRemaining--;
      this.updateTimerDisplay(this.totalSecondsRemaining);

      if (this.totalSecondsRemaining <= 0) {
        clearInterval(this.journeyInterval);
        this.triggerSafetyChallenge();
      }
    }, 1000);
  },

  updateTimerDisplay(seconds) {
    const digitsEl = document.getElementById('journey-timer-digits');
    if (!digitsEl) return;

    const safeSecs = Math.max(0, seconds);
    const m = Math.floor(safeSecs / 60);
    const s = safeSecs % 60;
    digitsEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  async extendJourney(extraMins = 5) {
    if (!this.activeCheckinId) return;

    try {
      const resp = await fetch(`/api/checkin/extend/${this.activeCheckinId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_minutes: extraMins })
      });
      const data = await resp.json();

      if (data.success) {
        this.totalSecondsRemaining += extraMins * 60;
        this.updateTimerDisplay(this.totalSecondsRemaining);
        alert(`⏱️ Safety timer extended by +${extraMins} minutes!`);
      } else {
        alert(data.error || 'Failed to extend time.');
      }
    } catch (e) {
      this.totalSecondsRemaining += extraMins * 60;
      this.updateTimerDisplay(this.totalSecondsRemaining);
    }
  },

  async markSafe() {
    if (this.journeyInterval) clearInterval(this.journeyInterval);

    if (this.activeCheckinId) {
      try {
        await fetch(`/api/checkin/safe/${this.activeCheckinId}`, { method: 'POST' });
      } catch (e) {}
    }

    this.resetJourneyUI();
    this.loadHistory();
    alert('🎉 Journey completed safely! Your guardians can rest easy.');
  },

  triggerSafetyChallenge() {
    const modal = document.getElementById('challenge-overlay');
    const timerEl = document.getElementById('challenge-timer-val');
    if (!modal) return;

    modal.style.display = 'flex';
    this.challengeSecondsLeft = 30;
    if (timerEl) timerEl.innerText = this.challengeSecondsLeft;

    if (typeof SOS !== 'undefined') {
      SOS.startSiren();
    }

    if (this.challengeInterval) clearInterval(this.challengeInterval);

    this.challengeInterval = setInterval(() => {
      this.challengeSecondsLeft--;
      if (timerEl) timerEl.innerText = this.challengeSecondsLeft;

      if (this.challengeSecondsLeft <= 0) {
        clearInterval(this.challengeInterval);
        this.escalateToSOS();
      }
    }, 1000);
  },

  async resolveChallengeSafe() {
    if (this.challengeInterval) clearInterval(this.challengeInterval);
    if (typeof SOS !== 'undefined') SOS.stopSiren();

    const modal = document.getElementById('challenge-overlay');
    if (modal) modal.style.display = 'none';

    await this.markSafe();
  },

  async escalateToSOS() {
    if (this.challengeInterval) clearInterval(this.challengeInterval);
    if (typeof SOS !== 'undefined') SOS.stopSiren();

    const modal = document.getElementById('challenge-overlay');
    if (modal) modal.style.display = 'none';

    if (this.activeCheckinId) {
      try {
        await fetch(`/api/checkin/escalate/${this.activeCheckinId}`, { method: 'POST' });
      } catch (e) {}
    }

    this.resetJourneyUI();
    this.loadHistory();

    if (typeof SOS !== 'undefined') {
      SOS.executeSOS('checkin_timeout');
    }
  },

  // ========================================================================
  // DISCREET FAKE CALL ESCAPE SIMULATOR
  // ========================================================================
  startFakeCallSimulation() {
    const overlay = document.getElementById('fake-call-overlay');
    const statusLabel = document.getElementById('fake-call-status-label');
    const activeBody = document.getElementById('fake-call-active-body');
    const acceptWrapper = document.getElementById('fake-call-accept-wrapper');

    if (!overlay) return;

    overlay.style.display = 'flex';
    if (statusLabel) statusLabel.innerText = 'Incoming Cellular Call...';
    if (activeBody) activeBody.style.display = 'none';
    if (acceptWrapper) acceptWrapper.style.display = 'flex';

    // Play ringing tone using Web Audio API
    this.playRingingChime();

    // Vibrate phone if supported
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([400, 200, 400, 200, 400]);
      } catch (e) {}
    }
  },

  playRingingChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.fakeCallAudioCtx = new AudioCtx();

      const playTone = () => {
        if (!this.fakeCallAudioCtx) return;
        const osc = this.fakeCallAudioCtx.createOscillator();
        const gain = this.fakeCallAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.fakeCallAudioCtx.currentTime);
        osc.frequency.setValueAtTime(480, this.fakeCallAudioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.fakeCallAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.fakeCallAudioCtx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(this.fakeCallAudioCtx.destination);
        osc.start();
        osc.stop(this.fakeCallAudioCtx.currentTime + 1.2);
      };

      playTone();
      this.fakeCallInterval = setInterval(playTone, 2500);
    } catch (e) {}
  },

  stopRingingChime() {
    if (this.fakeCallInterval) {
      clearInterval(this.fakeCallInterval);
      this.fakeCallInterval = null;
    }
    if (this.fakeCallAudioCtx) {
      try {
        this.fakeCallAudioCtx.close();
      } catch (e) {}
      this.fakeCallAudioCtx = null;
    }
  },

  acceptFakeCall() {
    this.stopRingingChime();

    const statusLabel = document.getElementById('fake-call-status-label');
    const activeBody = document.getElementById('fake-call-active-body');
    const acceptWrapper = document.getElementById('fake-call-accept-wrapper');
    const timerEl = document.getElementById('fake-call-timer');

    if (statusLabel) statusLabel.innerText = '00:01';
    if (activeBody) activeBody.style.display = 'block';
    if (acceptWrapper) acceptWrapper.style.display = 'none';

    let elapsed = 1;
    this.fakeCallInterval = setInterval(() => {
      elapsed++;
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      const formatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      if (statusLabel) statusLabel.innerText = formatted;
      if (timerEl) timerEl.innerText = formatted;
    }, 1000);
  },

  endFakeCall() {
    this.stopRingingChime();
    const overlay = document.getElementById('fake-call-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  // ========================================================================
  // RECENT JOURNEYS HISTORY LOADER
  // ========================================================================
  async loadHistory() {
    const container = document.getElementById('checkin-history-container');
    if (!container) return;

    try {
      const resp = await fetch('/api/checkin/history');
      const data = await resp.json();

      if (!data.success || !data.history || data.history.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:18px; color:#94a3b8; font-size:12px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
            No past safety check-ins yet. Start a journey timer whenever commuting!
          </div>
        `;
        return;
      }

      const modeIcons = { walking: '🚶', cab: '🚖', auto: '🛺', bus: '🚌' };

      container.innerHTML = data.history.map((j) => {
        const icon = modeIcons[j.transport_mode] || '🚶';
        const isSafe = j.status === 'safe';
        const isEscalated = j.status === 'escalated';
        const statusBadge = isSafe 
          ? `<span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800;">✓ SAFE</span>`
          : isEscalated 
            ? `<span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800;">🚨 SOS ESCALATED</span>`
            : `<span style="background:#fffbeb; color:#d97706; border:1px solid #fde68a; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800;">⏱️ ${j.status.toUpperCase()}</span>`;

        const vehText = j.vehicle_no ? `<span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700;">Plate: ${j.vehicle_no}</span>` : '';

        return `
          <div class="journey-item-card">
            <div style="min-width:0;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                <span style="font-size:16px;">${icon}</span>
                <span style="font-weight:800; font-size:13px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${j.destination || 'Commute Route'}</span>
                ${vehText}
              </div>
              <div style="font-size:11px; color:#64748b;">
                ${j.duration_minutes}m journey • ${j.started_at ? j.started_at.slice(5, 16) : ''}
              </div>
            </div>
            <div style="flex-shrink:0;">
              ${statusBadge}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('[CheckIn] History error:', e);
    }
  },

  resetJourneyUI() {
    if (this.journeyInterval) clearInterval(this.journeyInterval);
    if (this.challengeInterval) clearInterval(this.challengeInterval);

    const setupCard = document.getElementById('checkin-setup-card');
    const activeDisplay = document.getElementById('active-checkin-display');

    if (setupCard) setupCard.style.display = 'block';
    if (activeDisplay) activeDisplay.style.display = 'none';
    this.activeCheckinId = null;
  }
};

window.addEventListener('DOMContentLoaded', () => CheckIn.init());

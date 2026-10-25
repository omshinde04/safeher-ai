// ==========================================================================
// SAFEHER AI - JOURNEY SAFETY CHECK-IN ENGINE
// ==========================================================================

const CheckIn = {
  selectedDuration: 15,
  activeCheckinId: null,
  journeyInterval: null,
  challengeInterval: null,
  challengeSecondsLeft: 30,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const durationBtns = document.querySelectorAll('.btn-duration');
    durationBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        durationBtns.forEach((b) => b.classList.remove('selected'));
        e.target.classList.add('selected');
        this.selectedDuration = parseInt(e.target.getAttribute('data-mins'), 10);
      });
    });

    const btnStart = document.getElementById('btn-start-checkin');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.startJourney());
    }

    const btnSafe = document.getElementById('btn-reached-safe');
    if (btnSafe) {
      btnSafe.addEventListener('click', () => this.markSafe());
    }

    // Modal Challenge Buttons ("Are you safe?")
    const btnChallengeSafe = document.getElementById('btn-challenge-safe');
    if (btnChallengeSafe) {
      btnChallengeSafe.addEventListener('click', () => this.resolveChallengeSafe());
    }

    const btnChallengeHelp = document.getElementById('btn-challenge-help');
    if (btnChallengeHelp) {
      btnChallengeHelp.addEventListener('click', () => this.escalateToSOS());
    }
  },

  async startJourney() {
    const destInput = document.getElementById('checkin-destination');
    const destination = destInput ? destInput.value.trim() : 'Commute';

    try {
      const resp = await fetch('/api/checkin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_minutes: this.selectedDuration,
          destination: destination || 'Commute'
        })
      });

      const data = await resp.json();
      if (data.success) {
        this.activeCheckinId = data.checkin_id;
        this.showActiveJourneyUI(this.selectedDuration, destination);
      }
    } catch (e) {
      console.error('[CheckIn] Failed to start:', e);
      alert('Could not start check-in timer.');
    }
  },

  showActiveJourneyUI(durationMinutes, destination) {
    const setupCard = document.getElementById('checkin-setup-card');
    const activeDisplay = document.getElementById('active-checkin-display');
    const destLabel = document.getElementById('active-journey-destination');

    if (setupCard) setupCard.style.display = 'none';
    if (activeDisplay) activeDisplay.style.display = 'block';
    if (destLabel) destLabel.innerText = `Heading to: ${destination}`;

    let totalSeconds = durationMinutes * 60;
    this.updateTimerDisplay(totalSeconds);

    if (this.journeyInterval) clearInterval(this.journeyInterval);

    this.journeyInterval = setInterval(() => {
      totalSeconds--;
      this.updateTimerDisplay(totalSeconds);

      if (totalSeconds <= 0) {
        clearInterval(this.journeyInterval);
        this.triggerSafetyChallenge();
      }
    }, 1000);
  },

  updateTimerDisplay(seconds) {
    const digitsEl = document.getElementById('journey-timer-digits');
    if (!digitsEl) return;

    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    digitsEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  async markSafe() {
    if (this.journeyInterval) clearInterval(this.journeyInterval);

    if (this.activeCheckinId) {
      try {
        await fetch(`/api/checkin/safe/${this.activeCheckinId}`, { method: 'POST' });
      } catch (e) {}
    }

    this.resetJourneyUI();
    alert('🎉 Journey completed! Your status has been marked Safe.');
  },

  triggerSafetyChallenge() {
    const modal = document.getElementById('challenge-overlay');
    const timerEl = document.getElementById('challenge-timer-val');
    if (!modal) return;

    modal.style.display = 'flex';
    this.challengeSecondsLeft = 30;
    if (timerEl) timerEl.innerText = this.challengeSecondsLeft;

    // Play warning sound
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

    // Trigger full SOS immediately
    if (typeof SOS !== 'undefined') {
      SOS.executeSOS('checkin_timeout');
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

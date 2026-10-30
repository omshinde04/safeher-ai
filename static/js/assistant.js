// ==========================================================================
// SAFEHER AI - MULTILINGUAL SAFETY COMPANION (GEMINI AI + FALLBACK)
// ==========================================================================

const AIAssistant = {
  currentLanguage: 'en',
  recognition: null,
  isListening: false,
  messageStore: {},

  init() {
    this.bindEvents();
    this.initVoiceInput();
    this.updateQuickChips();
    this.appendBotMessage(
      "Hello! I am **SafeHer AI**, your intelligent personal safety guardian and tactical defense companion.\n\n" +
      "I am ready 24/7 to advise you on **stalking prevention, cab safety, late-night transit, self-defense moves**, and your **legal rights** in India.\n\n" +
      "Tap any quick scenario below, type your question, or tap 🎤 to speak.",
      'SafeHer Intelligence'
    );
  },

  bindEvents() {
    // Language chips
    const chips = document.querySelectorAll('.lang-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        chips.forEach((c) => c.classList.remove('active'));
        e.target.classList.add('active');
        this.currentLanguage = e.target.getAttribute('data-lang');
        this.onLanguageChanged();
      });
    });

    // Send button & Enter key
    const btnSend = document.getElementById('btn-send-chat');
    const inputChat = document.getElementById('chat-input');

    if (btnSend && inputChat) {
      btnSend.addEventListener('click', () => {
        this.sendMessage(inputChat.value.trim());
      });

      inputChat.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendMessage(inputChat.value.trim());
        }
      });
    }

    // Voice button
    const btnVoice = document.getElementById('btn-voice-chat');
    if (btnVoice) {
      btnVoice.addEventListener('click', () => this.toggleVoiceInput());
    }
  },

  initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const btnVoice = document.getElementById('btn-voice-chat');
      if (btnVoice) btnVoice.style.display = 'none';
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      const btnVoice = document.getElementById('btn-voice-chat');
      if (btnVoice) btnVoice.classList.add('listening');
      const inputChat = document.getElementById('chat-input');
      if (inputChat) inputChat.placeholder = this.getListeningPlaceholder();
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const inputChat = document.getElementById('chat-input');
      if (inputChat) {
        inputChat.value = transcript;
        this.sendMessage(transcript);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[AI Voice] Recognition error:', event.error);
      this.stopVoiceInput();
    };

    this.recognition.onend = () => {
      this.stopVoiceInput();
    };
  },

  toggleVoiceInput() {
    if (!this.recognition) {
      alert("Voice input is not supported in this browser. Please use Chrome or Safari.");
      return;
    }

    if (this.isListening) {
      this.recognition.stop();
      this.stopVoiceInput();
    } else {
      // Set language code
      const langCodes = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };
      this.recognition.lang = langCodes[this.currentLanguage] || 'en-IN';
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('[AI Voice] Start failed:', err);
      }
    }
  },

  stopVoiceInput() {
    this.isListening = false;
    const btnVoice = document.getElementById('btn-voice-chat');
    if (btnVoice) btnVoice.classList.remove('listening');
    const inputChat = document.getElementById('chat-input');
    if (inputChat) inputChat.placeholder = this.getInputPlaceholder();
  },

  getListeningPlaceholder() {
    if (this.currentLanguage === 'mr') return '🎙️ बोलणे चालू आहे... ऐकत आहे...';
    if (this.currentLanguage === 'hi') return '🎙️ बोलिए... मैं सुन रहा हूँ...';
    return '🎙️ Listening... speak your safety concern...';
  },

  getInputPlaceholder() {
    if (this.currentLanguage === 'mr') return 'मदतीसाठी प्रश्न विचारा किंवा 🎤 वर बोला...';
    if (this.currentLanguage === 'hi') return 'सुरक्षा के लिए पूछें या 🎤 पर बोलें...';
    return 'Ask AI safety companion or tap 🎤 to speak...';
  },

  updateQuickChips() {
    const container = document.getElementById('chat-quick-chips');
    if (!container) return;

    const scenarios = {
      en: [
        "🚨 Someone is following me",
        "🚖 Cab driver changed route",
        "🌙 Late night commute advice",
        "⚖️ Legal rights & Zero FIR",
        "🚇 Bus or Metro harassment"
      ],
      mr: [
        "🚨 कोणीतरी पाठलाग करत आहे",
        "🚖 कॅब चालकाने मार्ग बदलला",
        "🌙 रात्रीच्या प्रवासाचे नियम",
        "⚖️ महिलांचे हक्क व Zero FIR",
        "🚇 बस किंवा लोकलमध्ये त्रास"
      ],
      hi: [
        "🚨 कोई मेरा पीछा कर रहा है",
        "🚖 कैब ड्राइवर ने रास्ता बदला",
        "🌙 देर रात यात्रा सुरक्षा",
        "⚖️ कानूनी अधिकार व Zero FIR",
        "🚇 बस/मेट्रो में छेड़छाड़"
      ]
    };

    const list = scenarios[this.currentLanguage] || scenarios.en;
    container.innerHTML = list
      .map((item) => `<div class="quick-chip">${item}</div>`)
      .join('');

    // Re-bind click
    container.querySelectorAll('.quick-chip').forEach((q) => {
      q.addEventListener('click', () => {
        const text = q.innerText.replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
        this.sendMessage(text);
      });
    });
  },

  onLanguageChanged() {
    const greetings = {
      en: "🛡️ Language set to **English**. Ask me for tactical safety protocols, emergency guidance, or Indian legal protections.",
      mr: "🛡️ भाषा **मराठी** निवडली आहे. मी SafeHer AI आहे. रात्रीचा प्रवास, पाठलाग, कॅब सुरक्षा किंवा कायदेशीर मदतीसाठी विचारा.",
      hi: "🛡️ भाषा **हिन्दी** चुनी गई है। मैं SafeHer AI हूँ। आपातकालीन सलाह, पीछा, कैब सुरक्षा या कानूनी अधिकारों के बारे में पूछें।"
    };
    
    this.updateQuickChips();
    const inputChat = document.getElementById('chat-input');
    if (inputChat) inputChat.placeholder = this.getInputPlaceholder();
    this.appendBotMessage(greetings[this.currentLanguage] || greetings.en, 'System Intelligence');
  },

  async sendMessage(queryText) {
    if (!queryText) return;

    const inputChat = document.getElementById('chat-input');
    if (inputChat) inputChat.value = '';

    // Append User Message
    this.appendUserMessage(queryText);

    // Show typing placeholder
    const typingId = this.appendBotMessage("Analyzing threat level & calculating tactical safety advice...", 'SafeHer AI');

    try {
      const resp = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          language: this.currentLanguage
        })
      });

      const data = await resp.json();
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (data.response) {
        this.appendBotMessage(data.response, data.source || 'SafeHer AI', true);
      } else {
        this.appendBotMessage("Sorry, I could not process that. Please dial **112** if in urgent danger.", 'SafeHer AI');
      }
    } catch (e) {
      console.error('[AI] Chat error:', e);
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      this.appendBotMessage(
        "⚠️ Network interrupted. **Immediate Fallback Advisory:** Head towards a crowded well-lit area immediately and dial **112** or **1091**.",
        'SafeHer Offline Shield',
        true
      );
    }
  },

  appendUserMessage(text) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    const div = document.createElement('div');
    div.className = 'chat-bubble user';
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  },

  appendBotMessage(text, source, showActions = false) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return null;

    const msgId = 'msg-' + Math.random().toString(36).substr(2, 9);
    this.messageStore[msgId] = text;

    const div = document.createElement('div');
    div.id = msgId;
    div.className = 'chat-bubble bot';

    // Simple markdown-like bold and bullet formatting
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    // Optional Quick Action Buttons inside message
    let actionButtonsHtml = '';
    if (showActions) {
      actionButtonsHtml = `
        <div class="chat-action-row">
          <a href="tel:112" class="chat-action-btn call-112">📞 Call 112</a>
          <a href="tel:1091" class="chat-action-btn call-1091">📞 Women 1091</a>
          <button onclick="AIAssistant.triggerSOSFromChat()" class="chat-action-btn sos-btn">🚨 SOS</button>
          <button onclick="AIAssistant.speakMessage('${msgId}')" class="chat-action-btn tts-btn">🔊 Listen</button>
        </div>
      `;
    }

    div.innerHTML = `
      <div>${formatted}</div>
      ${actionButtonsHtml}
      <div style="font-size:10px; color:#64748b; margin-top:6px; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
        <span>⚡ ${source}</span>
        <span style="font-size:9px; color:#4f46e5; font-weight:700; text-transform:uppercase;">${this.currentLanguage}</span>
      </div>
    `;

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgId;
  },

  triggerSOSFromChat() {
    if (window.App && App.navigateTo) {
      App.navigateTo('sos');
    }
    if (window.SOSManager && SOSManager.startCountdown) {
      SOSManager.startCountdown();
    }
  },

  speakMessage(msgId) {
    const rawText = this.messageStore[msgId];
    if (!rawText || !window.speechSynthesis) return;

    // Clean markdown characters for smooth speech
    const cleanText = rawText
      .replace(/[*#_~]/g, '')
      .replace(/112/g, 'one one two')
      .replace(/1091/g, 'ten ninety one');

    window.speechSynthesis.cancel(); // Stop any previous speech
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Map language
    const langCodes = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };
    utterance.lang = langCodes[this.currentLanguage] || 'en-IN';
    utterance.rate = 0.95; // Calm, clear pace

    window.speechSynthesis.speak(utterance);
  }
};

window.addEventListener('DOMContentLoaded', () => AIAssistant.init());

# SafeHer AI: Smart Women Safety Progressive Web Application (PWA)
## Academic Project Report, Development & Viva Defense Guide

> **Institution**: JSPM's Rajarshi Shahu College of Engineering, Polytechnic, Tathawade, Pune  
> **Department**: Computer Engineering  
> **Course**: Seminar and Project Initiation Course (Code: 315003) — Semester V (K-Scheme)  
> **Academic Year**: 2026–2027  
> **Project Group Members**:
> 1. **Sakshi Anbhule** (Roll No: 05 | Enr: 24213360356)
> 2. **Vaishnavi Mane** (Roll No: 11 | Enr: 24213360362)
> 3. **Yashraj Nimbhore** (Roll No: 39 | Enr: 24213360399)
> 4. **Rutvik Kale** (Roll No: 27 | Enr: 24213360454)

---

## 1. Executive Summary & Problem Statement

### The Problem
Women and young girls often face unsafe situations during commutes, late-night travel, or when staying alone. In high-stress emergencies:
- **Manual Calling is Impractical**: Unlocking a phone, searching for contacts, and dialing numbers takes 20–40 critical seconds that victims rarely have.
- **Silent Threat Inability**: In situations like stalking or harassment, speaking aloud on a call can escalate danger.
- **Native App Disadvantages**: Existing apps (e.g., *Durga*, *SHAKE2Safety*) require prior installation from app stores, consume device storage/RAM, and are platform-locked.
- **Lack of Proactive Check-In**: Existing apps wait passively for a panic button to be pressed. They never ask *"Are you safe?"* when an expected trip is overdue.
- **Device Failure Vulnerability**: If a user's phone battery dies, guardians lose all contact without knowing the last known location.

### The Solution: SafeHer AI
**SafeHer AI** is an AI-powered, zero-install **Progressive Web Application (PWA)** that provides:
1. **1-Tap Instant SOS with Smart Countdown (0–15s)** to prevent accidental false triggers.
2. **Multi-Modal Emergency Sensors**: Shake-to-SOS (via Accelerometer `DeviceMotionEvent`) and Edge Voice Detection ("Help" / "Madat" / "वाचवा").
3. **Multilingual AI Safety Companion**: Powered by Google Gemini in **English, Marathi (मराठी), and Hindi (हिन्दी)** with instant offline fallback guidance.
4. **Journey Safety Check-In Timer**: Automated timer for late-night travel with a 30-second response window that automatically escalates to SOS on silence.
5. **Safe Walking Route & Live GPS**: Leaflet.js and OpenStreetMap navigation with 1-click WhatsApp trip sharing.
6. **Smart Battery Alert**: Detects low battery ($\le 15\%$) and prompts dispatch of last-known coordinates before phone power failure.
7. **Guardian Safety Dashboard**: Real-time status, battery monitor, and historical incident audit log.

---

## 2. Technical Stack & Architectural Rationale

| Layer | Technology | Engineering Rationale |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Modern CSS3 (Glassmorphism & Neon Cyberpunk palette), Vanilla JS | Ultra-lightweight, zero dependency bloat, loads instantly even on 3G connections. |
| **PWA Layer** | Service Worker (`sw.js`) + Web App Manifest | Enables installation on Android/iOS home screens, full offline caching, and native app look-and-feel without App Store friction. |
| **Backend** | Python 3.14 + Flask 3.1 + Gunicorn | Clean, modular micro-framework; minimal memory footprint; easy RESTful API architecture. |
| **Database** | SQLite3 with WAL mode | Lightweight, zero-config relational database; perfectly handles user credentials, emergency contacts, SOS events, and check-in audit trails. |
| **Maps & Routing** | Leaflet.js + OpenStreetMap + OSRM | 100% free, privacy-friendly, open-source mapping engine without Google Maps API credit card requirements. |
| **AI Engine** | Google Gemini API + Local Fallback Rules | Context-aware emergency guidance and de-escalation advice in regional Indian languages with instant local fallback if offline. |
| **Alert Protocols** | WhatsApp Click-to-Chat + Native `sms:` URI + SMTP Email | Zero-cost dispatch mechanisms; requires no expensive SMS gateway subscriptions (like Twilio). |
| **Deployment** | Render.com (Free Tier) with Automated HTTPS | 100% free hosting with automated SSL certificates (mandatory for browser Geolocation, PWA, and Accelerometer APIs). |

---

## 3. System Architecture & Data Flow

```
[ User Mobile / Desktop Browser (PWA) ]
      │
      ├── Service Worker (Offline Cache, Assets, Push)
      ├── Web Sensor APIs (Geolocation, DeviceMotionEvent, Battery API, Web Speech API)
      │
      ▼ (HTTPS / JSON REST API)
[ Python Flask Backend Server ]
      │
      ├── Authentication & Session Manager (Werkzeug Password Hashing)
      ├── Emergency Dispatch Engine (WhatsApp, SMS, SMTP Email)
      ├── Gemini AI Client (Multilingual Safety Intelligence)
      │
      ▼ (SQL Queries)
[ SQLite Database (users.db) ]
      ├── users (id, name, email, phone, password_hash, created_at)
      ├── emergency_contacts (id, user_id, name, phone, email, relation)
      ├── sos_events (id, user_id, latitude, longitude, battery_level, status, timestamp)
      └── checkins (id, user_id, duration_minutes, status, created_at, escalated)
```

---

## 4. Key Modules & Implementation Details

### Module 1: Smart SOS Engine with Accidental Alarm Prevention
* **How it works**: When the SOS button is tapped, a pulsing visual timer starts with an audio beep tone. The user has **10 seconds** (configurable 0–15s) to cancel if triggered accidentally.
* **On Expiry**: The app locks GPS coordinates (`latitude`, `longitude`, `accuracy`), reads battery percentage, logs an incident to SQLite, and launches emergency communication.
* **Instant Actions**:
  - Direct call button to **112** (National Emergency) and **1091** (Women Helpline).
  - WhatsApp deep-link to saved guardians with Google Maps live location link.
  - SMS fallback button for phones without mobile data.
  - Server-side email notification sent to guardians with map coordinates.

### Module 2: Shake-to-SOS (Device Accelerometer)
* **API Used**: `window.DeviceMotionEvent`.
* **Algorithm**: Measures total linear acceleration:
  $$\text{Acceleration} = \sqrt{a_x^2 + a_y^2 + a_z^2}$$
  When magnitude delta exceeds threshold ($> 25\text{ m/s}^2$) more than 3 times within 1.5 seconds, the system activates the SOS countdown immediately.

### Module 3: Offline Edge Voice SOS ("Help" / "Madat")
* **API Used**: HTML5 Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`).
* **Trigger Words**: `"help"`, `"madat"`, `"bachao"`, `"emergency"`, `"वाचवा"`.
* **Benefit**: Hands-free SOS activation when the phone cannot be physically held.

### Module 4: Journey Safety Check-In System
* **Workflow**:
  1. User sets journey time (e.g., 15 minutes to reach the metro station).
  2. Timer runs in the background.
  3. At 00:00, a loud alarm sounds with a high-contrast challenge: *"Are You Safe?"*
  4. User has **30 seconds** to tap *"I am Safe"* (requires biometric or confirmation click).
  5. If user taps *"Need Help"* or **fails to respond within 30 seconds**, the system automatically triggers an SOS alert with the latest GPS coordinates.

### Module 5: Multilingual AI Safety Assistant (Gemini API)
* **Languages**: English, Marathi (मराठी), Hindi (हिन्दी).
* **Prompt Engineering**: Instructed to provide calm, direct, actionable, step-by-step physical and psychological safety advice (e.g., handling stalkers, safe spots, cab disputes).
* **Offline Fallback Engine**: If internet connectivity is interrupted, the PWA serves pre-cached regional safety guidelines and self-defense tips.

### Module 6: Live Map & Safe Route Navigation
* **Components**: Leaflet.js interactive maps + OpenStreetMap tiles + OSRM walking directions.
* **Features**: Live user marker tracking, destination search via Nominatim, walking route distance and estimated time, and a 1-tap "Share Trip on WhatsApp" button.

### Module 7: Smart Battery Monitor
* **API Used**: `navigator.getBattery()`.
* **Logic**: If `battery.level <= 0.15` and `battery.charging === false`, a persistent caution banner alerts the user: *"Low Battery (15%)! Send your live location to guardians before phone powers down."*

---

## 5. College Viva Examination: Frequently Asked Questions & Model Answers

### Q1: Why did you build a Progressive Web App (PWA) instead of a native Android APK?
> **Answer**:  
> In real-world emergencies, installation friction is dangerous. Traditional native apps require downloading 40–80 MB from Google Play Store, managing device permissions, and taking up phone storage. SafeHer AI as a PWA requires **0 installs**—anyone can open the link in any browser (Chrome, Safari, Firefox), tap **"Add to Home Screen"**, and it immediately behaves like a native app with offline caching, camera/GPS access, and instant updates across both Android and iOS devices.

### Q2: How does the system handle accidental false SOS triggers?
> **Answer**:  
> We implemented a **Smart Countdown Window (configurable 5 to 15 seconds)**. When the SOS is activated (via button, shake, or voice), an audible and visual countdown begins. The user can simply tap "Cancel" within this grace period, preventing panicked false alarms to family members or emergency services.

### Q3: What happens if the user is in an area with poor or no internet connection?
> **Answer**:  
> 1. The PWA is cached locally via our **Service Worker**, so all screens, maps, and offline safety tips load without internet.  
> 2. Geolocation runs directly via device satellite GPS hardware (`navigator.geolocation`), which functions completely offline without cellular data.  
> 3. For communication without data, the app provides direct **SMS fallback (`sms:`)** and instant dial triggers to national helplines (**112** and **1091**), which work over standard GSM cellular networks without mobile data.

### Q4: How is user data and password security handled?
> **Answer**:  
> Passwords are never stored in plain text. They are hashed using salted cryptographic hashing (`werkzeug.security.generate_password_hash`). Session cookies are secured with `HttpOnly` and `SameSite` flags. Cross-Origin and CSRF attack protections are implemented on all POST endpoints, and API keys are stored in server environment variables rather than hardcoded in the frontend.

### Q5: How does the Shake-to-SOS feature work under the hood?
> **Answer**:  
> We utilize the browser's `DeviceMotionEvent` API. It continuously samples linear acceleration along the X, Y, and Z axes. We apply an acceleration magnitude formula $\sqrt{x^2 + y^2 + z^2}$. To avoid false positives from normal walking or running, our algorithm requires the acceleration to exceed a high G-force threshold ($>25\text{ m/s}^2$) three consecutive times within a short 1.5-second time window before triggering the emergency countdown.

### Q6: Why did you choose SQLite and Flask over other technologies?
> **Answer**:  
> Flask is a lightweight WSGI web framework in Python that allows us to build fast, clean RESTful endpoints with minimal overhead. SQLite is a serverless, zero-configuration relational database that stores records directly in a clean disk file. For our application, it provides ACID compliance, fast read/write times for user profiles and SOS incident logging, and allows the entire project to run on free hosting tiers without monthly database server costs.

---

## 6. Zero-Cost Free Deployment Guide (Render.com)

1. **Step 1: Push Project to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "SafeHer AI - Initial Production Release"
   git branch -M main
   git remote add origin https://github.com/<your-username>/safeher-ai.git
   git push -u origin main
   ```
2. **Step 2: Create Web Service on Render**:
   - Go to [render.com](https://render.com) and log in with GitHub.
   - Click **New +** -> **Web Service**.
   - Select your `safeher-ai` repository.
   - Set **Build Command**: `pip install -r requirements.txt`
   - Set **Start Command**: `gunicorn app:app`
   - Plan: **Free** ($0 / month).
3. **Step 3: Environment Variables**:
   - In Render Dashboard under **Environment**, add:
     - `GEMINI_API_KEY`: *(Your Google AI Studio key)*
     - `SECRET_KEY`: *(Any random 32-character string)*
4. **Step 4: Launch & Test**:
   - Render automatically provisions a free SSL certificate (`https://safeher-ai.onrender.com`).
   - Open on your mobile phone browser -> tap "Add to Home Screen" -> test live GPS and SOS triggers!

---

## 7. Demo Credentials & Presentation Walkthrough

For college project viva and teacher demonstrations, pre-seeded demo credentials are ready to use:

* **Demo App URL**: `http://127.0.0.1:5005` (or your live Render link)
* **Demo Email**: `demo@safeher.in`
* **Demo Password**: `SafeHer@2026`
* **Guardian Security Code**: `SH-DEMO1`
* **Live Guardian Dashboard URL**: `http://127.0.0.1:5005/guardian/SH-DEMO1`
* **1-Tap Login**: On the login page, simply tap the **"⚡ Quick Demo Login (RSCOE Examiner)"** button to log in instantly without typing!

---

## 8. Phased Development Roadmap Status

- [x] **Phase 1: Architecture, Project Structure & Academic Documentation** *(Completed)*
- [x] **Phase 2: Database Schema & Flask RESTful Backend Core** *(Completed)*
- [x] **Phase 3: Next-Level Cyberpunk Glassmorphic PWA UI System** *(Completed)*
- [x] **Phase 4: Client Sensors (Shake-to-SOS, Voice SOS, Battery Alert, Leaflet Map)** *(Completed)*
- [x] **Phase 5: Journey Check-In & Multilingual Gemini AI Assistant** *(Completed)*
- [x] **Phase 6: Full End-to-End Verification, PWA Testing & Deployment Prep** *(Completed)*


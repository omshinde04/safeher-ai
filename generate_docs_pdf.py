import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and draw total page numbers and header/footer."""
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#4F46E5"))
        
        # Don't draw header on first page
        if self._pageNumber > 1:
            self.drawString(54, 11 * inch - 36, "SAFEHER AI — ENTERPRISE PROJECT SPECIFICATION")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawRightString(8.5 * inch - 54, 11 * inch - 36, "Comprehensive 4-Member Architecture & Tech Document")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.75)
            self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)

        # Footer on all pages
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(54, 40, 8.5 * inch - 54, 40)

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 28, "SafeHer AI • JSPM's RSCOE Polytechnic, Pune • Computer Engineering")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 28, page_str)
        self.restoreState()


def create_documentation_pdf(filename="documents/SAFEHER_AI_PROJECT_DOCUMENTATION.pdf"):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=48,
        rightMargin=48,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Custom Color Palette
    PRIMARY = colors.HexColor("#4F46E5")       # Royal Indigo
    SECONDARY = colors.HexColor("#0F172A")     # Midnight Slate
    TEXT_DARK = colors.HexColor("#1E293B")     # Dark Slate
    TEXT_MUTED = colors.HexColor("#64748B")    # Slate Muted
    BG_LIGHT = colors.HexColor("#F8FAFC")      # Cloud White
    BORDER_CLR = colors.HexColor("#E2E8F0")

    # Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=TEXT_MUTED,
        spaceAfter=8
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=SECONDARY,
        spaceBefore=8,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=PRIMARY,
        spaceBefore=6,
        spaceAfter=2,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=TEXT_DARK,
        spaceAfter=4
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=TEXT_DARK
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell_style,
        fontName='Helvetica-Bold',
        textColor=SECONDARY
    )

    story = []

    # =========================================================================
    # PAGE 1: TITLE, META, PROBLEM, AND COMPLETE 4-MEMBER WBS MATRIX
    # =========================================================================
    story.append(Paragraph("SAFEHER AI — PROJECT SPECIFICATION", title_style))
    story.append(Paragraph("Smart AI-Powered Women Safety Progressive Web Application (PWA) • Complete Client & Academic Deliverable", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceAfter=8))

    # Meta Overview Box
    meta_data = [
        [
            Paragraph("<b>Project Title:</b> SafeHer AI (Safety PWA)", table_cell_style),
            Paragraph("<b>Academic Year:</b> 2026–2027 (Semester V)", table_cell_style)
        ],
        [
            Paragraph("<b>Institution:</b> JSPM's RSCOE Polytechnic, Pune", table_cell_style),
            Paragraph("<b>Course Code:</b> 315003 (Computer Engineering)", table_cell_style)
        ],
        [
            Paragraph("<b>Live Cloud URL:</b> <font color='#4F46E5'><u>safeher-ai-qirp.onrender.com</u></font>", table_cell_style),
            Paragraph("<b>Source Code:</b> <font color='#4F46E5'><u>github.com/omshinde04/safeher-ai</u></font>", table_cell_style)
        ],
        [
            Paragraph("<b>Architecture:</b> 0-Install Mobile PWA + Flask Microservice", table_cell_style),
            Paragraph("<b>Database:</b> SQLite3 (WAL Mode & Auto-Migrations)", table_cell_style)
        ]
    ]
    t_meta = Table(meta_data, colWidths=[260, 256])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_CLR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_CLR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 8))

    story.append(Paragraph("1. Executive Summary & Problem Scope", h1_style))
    story.append(Paragraph(
        "Women and young girls often face unsafe situations during late commutes or when living alone. "
        "Traditional native mobile apps require large 50MB app store downloads, continuous permissions, and passive button-pressing. "
        "Crucially, existing tools fail to monitor battery drain or provide proactive travel check-ins. "
        "<b>SafeHer AI</b> eliminates these barriers with an instantaneous <b>Zero-Install Progressive Web App</b> that delivers "
        "hardware-accelerated Shake-to-SOS, hands-free Voice SOS, automated Journey Commute Check-Ins, Leaflet GPS navigation, "
        "and remote real-time Guardian monitoring.",
        body_style
    ))
    story.append(Spacer(1, 6))

    # WBS Table
    story.append(Paragraph("2. 4-Member Team Work Breakdown Structure (WBS)", h1_style))
    story.append(Paragraph(
        "To ensure production-grade engineering, modular development, and rigorous academic accountability, "
        "the architecture is partitioned across four specialized technical domains:",
        body_style
    ))

    team_data = [
        [
            Paragraph("Team Member", table_header_style),
            Paragraph("Designated Engineering Role", table_header_style),
            Paragraph("Assigned Core Modules & Technical Deliverables", table_header_style)
        ],
        [
            Paragraph("<b>Sakshi Anbhule</b><br/><font color='#64748B'>Roll: 05 | Enr: 24213360356</font>", table_cell_style),
            Paragraph("<b>Team Lead & Frontend Architecture</b>", table_cell_bold),
            Paragraph(
                "• Progressive Web App (PWA) Service Worker (<code>sw.js</code>) and Web Manifest.<br/>"
                "• Unified Mobile-First SaaS Layout, CSS Grid Design System, and Bottom Nav Dock.<br/>"
                "• Auth Screens (Login / Register segmented views) & Profile editing dialogs.<br/>"
                "• Cross-platform iOS 13+ viewport optimization & notch safe-area styling.",
                table_cell_style
            )
        ],
        [
            Paragraph("<b>Om Shinde / Rutvik Kale</b><br/><font color='#64748B'>Roll: 27 | Enr: 24213360454</font>", table_cell_style),
            Paragraph("<b>Backend Systems & Cloud Operations</b>", table_cell_bold),
            Paragraph(
                "• Python 3.14 + Flask RESTful API Architecture with Gunicorn WSGI.<br/>"
                "• PBKDF2 Cryptographic Password Hashing & multi-tenant session isolation.<br/>"
                "• SQLite3 Relational Database Schema, WAL mode, & dynamic column migrations.<br/>"
                "• Render Cloud deployment automation, HTTPS SSL certificates, & health checks.",
                table_cell_style
            )
        ],
        [
            Paragraph("<b>Vaishnavi Mane</b><br/><font color='#64748B'>Roll: 11 | Enr: 24213360362</font>", table_cell_style),
            Paragraph("<b>Hardware Sensors & Telemetry Engineer</b>", table_cell_bold),
            Paragraph(
                "• <code>DeviceMotionEvent</code> Accelerometer 3-shake detection (> 25 m/s² threshold).<br/>"
                "• HTML5 Web Speech API Voice SOS trigger (\"Help\", \"Bachao\", \"Madat\", \"Vachva\").<br/>"
                "• Smart Battery Telemetry Engine: Hardware API + iOS manual calibration sync modal.<br/>"
                "• Critical Low-Battery Alert banner (&le; 15%) and automated 25s server heartbeat.",
                table_cell_style
            )
        ],
        [
            Paragraph("<b>Yashraj Nimbhore</b><br/><font color='#64748B'>Roll: 39 | Enr: 24213360399</font>", table_cell_style),
            Paragraph("<b>AI Systems, Maps & Emergency Dispatch</b>", table_cell_bold),
            Paragraph(
                "• Multilingual AI Safety Assistant powered by Google Gemini API (English, Marathi, Hindi).<br/>"
                "• Journey Commute Safety Check-In Engine with vehicle tracking & 30s challenge.<br/>"
                "• Discreet Fake Call Harassment Deterrence Simulator with Web Audio API chime.<br/>"
                "• Leaflet.js + OpenStreetMap + OSRM walking route planner & Guardian live view.",
                table_cell_style
            )
        ]
    ]

    t_team = Table(team_data, colWidths=[120, 136, 260])
    t_team.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_CLR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_team)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 2: TECH STACK & SYSTEM ARCHITECTURE
    # =========================================================================
    story.append(Paragraph("3. Technical Stack & Architectural Rationale", h1_style))
    story.append(Paragraph(
        "The application is engineered strictly with production best practices, emphasizing zero-cost hosting, "
        "zero API license fees, maximum privacy, and sub-second execution speed across low-bandwidth cellular devices:",
        body_style
    ))

    stack_data = [
        [
            Paragraph("Technology Layer", table_header_style),
            Paragraph("Technology Selected", table_header_style),
            Paragraph("Architectural & Production Rationale", table_header_style)
        ],
        [
            Paragraph("<b>Frontend Core</b>", table_cell_bold),
            Paragraph("HTML5, Vanilla CSS3, Vanilla JS (ES6+)", table_cell_style),
            Paragraph("Eliminates heavy framework bloat (React/Angular); loads under 1 second on 3G cellular.", table_cell_style)
        ],
        [
            Paragraph("<b>PWA Layer</b>", table_cell_bold),
            Paragraph("Service Worker + Manifest JSON", table_cell_style),
            Paragraph("Enables 1-tap 'Add to Home Screen', offline asset caching, and native mobile look.", table_cell_style)
        ],
        [
            Paragraph("<b>Backend Server</b>", table_cell_bold),
            Paragraph("Python 3.14 + Flask 3.1 + Gunicorn", table_cell_style),
            Paragraph("Lightweight, asynchronous WSGI microframework with minimal memory footprint (<60MB RAM).", table_cell_style)
        ],
        [
            Paragraph("<b>Database</b>", table_cell_bold),
            Paragraph("SQLite3 with WAL Mode & Auto-Migrations", table_cell_style),
            Paragraph("ACID compliant, zero-configuration relational storage with automatic runtime schema migrations.", table_cell_style)
        ],
        [
            Paragraph("<b>Maps & Routing</b>", table_cell_bold),
            Paragraph("Leaflet.js + OpenStreetMap + OSRM", table_cell_style),
            Paragraph("100% free, privacy-friendly mapping with zero Google Maps API credit card dependencies.", table_cell_style)
        ],
        [
            Paragraph("<b>AI Engine</b>", table_cell_bold),
            Paragraph("Google Gemini API + Local Fallback", table_cell_style),
            Paragraph("Context-aware de-escalation advice in English, Marathi, & Hindi with zero-delay local fallback.", table_cell_style)
        ],
        [
            Paragraph("<b>Audio Synthesis</b>", table_cell_bold),
            Paragraph("HTML5 Web Audio API", table_cell_style),
            Paragraph("Synthesizes loud alternating emergency sirens & fake call chimes without external MP3 files.", table_cell_style)
        ],
        [
            Paragraph("<b>Deployment</b>", table_cell_bold),
            Paragraph("Render.com Cloud (Docker/Linux)", table_cell_style),
            Paragraph("Automated Git push CI/CD deployment with mandatory HTTPS SSL for Geolocation & Sensors.", table_cell_style)
        ]
    ]

    t_stack = Table(stack_data, colWidths=[96, 140, 280])
    t_stack.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SECONDARY),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_CLR),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_stack)
    story.append(Spacer(1, 10))

    story.append(Paragraph("4. End-to-End System Architecture & Data Flow", h1_style))
    story.append(Paragraph(
        "<b>Step 1: Sensor & User Input Layer (Browser Client)</b><br/>"
        "The client browser operates the central sensor hub (<code>sensors.js</code>, <code>sos.js</code>, <code>checkin.js</code>). "
        "It monitors physical shakes via <code>DeviceMotionEvent</code>, ambient distress speech via the Web Speech API, "
        "exact device battery via <code>navigator.getBattery()</code> or the iOS Calibration Modal, and real-time GPS coordinates.<br/><br/>"
        "<b>Step 2: Microservice Processing Layer (Flask Backend)</b><br/>"
        "All requests authenticate through secure session cookies. The backend manages emergency event logging, "
        "dispatches WhatsApp deep links with embedded Google Maps coordinates, routes multilingual queries to the Google Gemini AI "
        "engine, and coordinates safety timers.<br/><br/>"
        "<b>Step 3: Relational Persistence Layer (SQLite3 Database)</b><br/>"
        "Structured tables isolate user data: <code>users</code> (credentials, guardian codes, live telemetry), "
        "<code>emergency_contacts</code> (trusted guardians), <code>sos_events</code> (incident audit log), "
        "and <code>checkins</code> (active journey timers, battery levels, and vehicle numbers).<br/><br/>"
        "<b>Step 4: Remote Guardian Live Tracking Layer</b><br/>"
        "Guardians open <code>/guardian/&lt;guardian_code&gt;</code> without requiring an account. "
        "The view polls every 5 seconds, displaying a live Leaflet marker of the user's location, color-coded battery health, "
        "ongoing trip status, and direct emergency calling shortcuts to 112 and 1091.",
        body_style
    ))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 3: COMPREHENSIVE 9 CORE FUNCTIONAL MODULES
    # =========================================================================
    story.append(Paragraph("5. Detailed Functional Modules & Working Logic", h1_style))

    modules = [
        ("Module 1: 1-Tap SOS with Accidental Trigger Prevention",
         "A prominent pulsating SOS hero button activates an emergency countdown (configurable 5 to 15 seconds) accompanied by an escalating audio alarm. If triggered by accident, the user can cancel within the grace period. Upon expiration, it captures high-accuracy GPS coordinates, reads device battery, creates an active SOS audit record, and reveals direct 1-tap WhatsApp dispatches to saved emergency contacts along with instant phone dialers for National Emergency (112) and Women Helpline (1091)."),

        ("Module 2: Hardware Accelerometer Shake-to-SOS",
         "Utilizes the browser's <code>DeviceMotionEvent</code> API to continuously measure linear acceleration magnitude across X, Y, and Z axes: Magnitude = sqrt(ax² + ay² + az²). When acceleration exceeds 25 m/s² three times within 1.5 seconds, the emergency sequence executes automatically. Includes explicit iOS motion permission handling."),

        ("Module 3: Hands-Free Edge Voice Detection SOS",
         "Leverages the HTML5 Web Speech API (<code>SpeechRecognition</code> / <code>webkitSpeechRecognition</code>) running directly on the device. Continuously listens for emergency trigger phrases in regional and national languages: 'Help', 'Bachao', 'Madat', 'Emergency', and 'Vachva'. Provides completely hands-free activation when a user cannot physically touch their device."),

        ("Module 4: Journey Safety Check-In Timer with Escalation",
         "Designed for late-night commutes, cabs, autos, and walking. Users specify destination, transport mode (Walking, Cab, Auto, Bus), vehicle number plate, and duration (5m to 60m). The journey generates a live WhatsApp trip link with real-time battery for guardians. When time expires, a loud alarm sounds with an 'Are You Safe?' challenge. If unanswered within 30 seconds, it automatically escalates to a full Emergency SOS alert."),

        ("Module 5: Discreet Fake Call Harassment Deterrence Simulator",
         "A discreet escape tool for uncomfortable or threatening encounters in cabs, elevators, or streets. Tapping 'Fake Call' simulates an authentic incoming cellular call from 'Dad / Family' complete with realistic ringing chimes and device vibration. Accepting the call displays a real-time call timer and a convincing talking script ('Yes Dad, I'm just 2 minutes away, wait at the gate!') to deter potential harassers without escalating tension."),

        ("Module 6: Safe Walking Route Navigation & Live GPS Map",
         "Integrates Leaflet.js with OpenStreetMap and OSRM (Open Source Routing Machine). Tracks user location in real-time, supports destination geocoding via OpenStreetMap Nominatim, plots optimal walking paths with distance and estimated walking time, and includes 1-tap trip sharing to WhatsApp."),

        ("Module 7: Real-Time Smart Battery Telemetry Engine",
         "Monitors device battery using <code>navigator.getBattery()</code> on Android/Chrome/Edge. For iOS devices where Apple restricts battery APIs, SafeHer AI incorporates a calibrated Device Battery Sync Modal. Battery levels sync automatically to the cloud every 25 seconds. If battery drops to <= 15%, an alert banner advises transmitting coordinates before the device powers down."),

        ("Module 8: Multilingual AI Safety Assistant (Google Gemini)",
         "Powered by the Google Gemini API with conversational capabilities in English, Marathi, and Hindi. Programmed with safety protocols for stalking, cyber-safety, and domestic threats. Incorporates an instant pre-cached local rule engine that provides immediate de-escalation tips even if internet access drops."),

        ("Module 9: Guardian Real-Time Live Tracking Dashboard",
         "Accessible via <code>/guardian/&lt;guardian_code&gt;</code> without login friction. Telemetry polling (every 5s) displays live GPS positioning on a Leaflet map, dynamic color-coded battery percentage (green >50%, amber 21–50%, red <=20%), active commute details, and direct one-click helpline buttons.")
    ]

    for title, desc in modules:
        story.append(Paragraph(f"<b>{title}</b>", h2_style))
        story.append(Paragraph(desc, body_style))
        story.append(Spacer(1, 2))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 4: SECURITY, PRIVACY & COLLEGE VIVA DEFENSE
    # =========================================================================
    story.append(Paragraph("6. Security, Privacy & Multi-Tenant Data Isolation", h1_style))
    story.append(Paragraph(
        "SafeHer AI implements defense-in-depth security principles to safeguard user privacy and sensitive location data:",
        body_style
    ))

    sec_items = [
        ("Cryptographic Password Protection", "Passwords are never saved in plain text. They are hashed using salted cryptographic PBKDF2 with SHA-256 (<code>generate_password_hash</code>)."),
        ("Row-Level Session Isolation", "Every database operation explicitly scopes queries with <code>WHERE user_id = session['user_id']</code>. A user cannot access, modify, or view another user's contacts, SOS incidents, or journeys."),
        ("Tokenized Guardian Authorization", "Guardian views do not expose user passwords or accounts. They are accessible solely via an unguessable unique alphanumeric token (e.g., <code>SH-OM01</code>)."),
        ("Zero Third-Party Advertising", "Zero external ad trackers, marketing pixels, or analytics trackers are loaded, preserving complete user confidentiality."),
        ("Ephemeral Database Continuity", "Configured with startup auto-seeding in <code>database.py</code> to ensure uninterrupted access even when cloud containers recycle.")
    ]

    for title, desc in sec_items:
        story.append(Paragraph(f"• <b>{title}:</b> {desc}", bullet_style))

    story.append(Spacer(1, 8))
    story.append(Paragraph("7. College Viva Examination Defense & Model Answers", h1_style))

    viva_qa = [
        ("Q1: Why choose a Progressive Web App (PWA) over a native Android APK?",
         "In emergencies, installation friction can be fatal. Native apps require downloading 50MB from Play Store and managing complex device permissions. SafeHer AI opens in under 1 second in any browser, works offline via Service Workers, and can be installed via 'Add to Home Screen' without an app store."),

        ("Q2: How does the system prevent accidental false SOS dispatches?",
         "We implemented a configurable 10-second Smart Countdown window. When SOS triggers (button, shake, or voice), an audible siren and visual countdown allow the user to easily cancel accidental triggers before messages reach family."),

        ("Q3: How does the app operate if mobile cellular data is unavailable?",
         "The PWA's Service Worker caches the UI, maps, and safety guides locally. Geolocation uses hardware satellite GPS without data. For messaging without data, the app falls back to standard GSM SMS (<code>sms:</code>) and cellular phone dialing to 112 and 1091."),

        ("Q4: How does the battery monitoring function across different phone operating systems?",
         "On Android/Chrome, the system utilizes the native <code>navigator.getBattery()</code> API. On iOS/Safari (where Apple blocks the Battery API for privacy), SafeHer AI provides a specialized Device Battery Sync modal with a slider and quick presets, sending periodic heartbeats to the server.")
    ]

    for q, a in viva_qa:
        story.append(Paragraph(f"<b>{q}</b>", h2_style))
        story.append(Paragraph(f"<i>Model Answer:</i> {a}", body_style))
        story.append(Spacer(1, 3))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_CLR, spaceAfter=6))
    story.append(Paragraph(
        "<b>Document Sign-off:</b> Prepared and certified by SafeHer AI Engineering Team • JSPM's RSCOE Polytechnic, Pune • Academic Year 2026–2027",
        ParagraphStyle('SignOff', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8, textColor=TEXT_MUTED, alignment=1)
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[PDF Generated] {filename} successfully created.")

if __name__ == "__main__":
    out_file = sys.argv[1] if len(sys.argv) > 1 else "documents/SAFEHER_AI_PROJECT_DOCUMENTATION.pdf"
    create_documentation_pdf(out_file)

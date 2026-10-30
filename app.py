import os
import secrets
import datetime
import requests
import threading
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db, init_db

# Load local .env file if present
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                val = v.strip().strip('"').strip("'")
                if val:
                    os.environ[k.strip()] = val

import time

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(24))

# Initialize database on startup
init_db()

# --- Application Diagnostics & Event Logging System ---
APP_START_TIME = time.time()
SYSTEM_LOGS = []
MAX_LOG_ENTRIES = 200

def log_event(category, message, level="INFO"):
    """Appends an event to the circular buffer and prints structured line for Render logs."""
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    client_ip = request.remote_addr if request else '127.0.0.1'
    entry = {
        'timestamp': now_str,
        'category': category.upper(),
        'level': level.upper(),
        'message': message,
        'ip': client_ip
    }
    SYSTEM_LOGS.append(entry)
    if len(SYSTEM_LOGS) > MAX_LOG_ENTRIES:
        SYSTEM_LOGS.pop(0)
    print(f"[{now_str}] [{level.upper()}] [{category.upper()}] {message} (IP: {client_ip})", flush=True)

# --- Fast2SMS Automated SMS Gateway Integration ---
FAST2SMS_API_KEY = os.environ.get('FAST2SMS_API_KEY', 'LEt0L9MHA2ufWZ3KgcRTbWnNJiKGlNdXCQubhrAYQCpRmR6UaR0fDYRIi5P5400k47epMcy7jDU00hCX')
ENABLE_FAST2SMS = os.environ.get('ENABLE_FAST2SMS', 'true').lower() == 'true'

def send_automated_fast2sms(contact_phones, user_name, maps_link, battery, trigger_type, guardian_url):
    """Dispatches background SMS via Fast2SMS API directly to guardian phone SIM cards."""
    if not ENABLE_FAST2SMS:
        log_event('FAST2SMS', 'ℹ️ Fast2SMS Quick SMS route paused. Direct 100% free cellular SMS active.', level="INFO")
        return
    if not FAST2SMS_API_KEY or not contact_phones:
        return
    try:
        clean_numbers = []
        for p in contact_phones:
            digits = "".join([c for c in str(p) if c.isdigit()])
            if len(digits) >= 10:
                clean_numbers.append(digits[-10:])
        if not clean_numbers:
            return

        # Strictly limit to under 130 characters so Fast2SMS NEVER splits into 2 SMS (which doubled cost to ₹14)
        clean_name = (user_name or 'User')[:18].strip()
        sms_text = f"SOS: {clean_name} in danger! Loc: {maps_link} Batt:{battery}%"[:130]
        url = "https://www.fast2sms.com/dev/bulkV2"
        payload = {
            "route": "q",
            "message": sms_text,
            "numbers": ",".join(clean_numbers)
        }
        headers = {
            "authorization": FAST2SMS_API_KEY,
            "Content-Type": "application/json",
            "accept": "application/json"
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        
        # If POST returned non-200, try the GET endpoint fallback
        if resp.status_code != 200:
            get_url = f"https://www.fast2sms.com/dev/bulkV2?route=q&message={requests.utils.quote(sms_text[:160])}&numbers={','.join(clean_numbers)}"
            resp = requests.get(get_url, headers={"authorization": FAST2SMS_API_KEY, "accept": "application/json"}, timeout=10)
            log_event('FAST2SMS', f"🔄 Fast2SMS GET route to {len(clean_numbers)} guardian(s) {clean_numbers} | Response: {resp.status_code} {resp.text}", level="ALERT")
        else:
            log_event('FAST2SMS', f"✅ Dispatched SMS to {len(clean_numbers)} guardian(s) {clean_numbers} | Response: {resp.status_code} {resp.text}", level="ALERT")
    except Exception as e:
        log_event('FAST2SMS', f"❌ SMS auto-dispatch error: {e}", level="ERROR")

@app.before_request
def record_start_time():
    request._start_time = time.time()

@app.after_request
def log_request_info(response):
    # Skip noisy static assets to keep Render logs clean and readable
    if not request.path.startswith('/static') and request.path not in ('/favicon.ico', '/manifest.json', '/sw.js'):
        duration = round((time.time() - getattr(request, '_start_time', time.time())) * 1000, 1)
        uid = session.get('user_id')
        user_str = f"User #{uid}" if uid else "Guest"
        print(f"[SafeHer AI] {request.method} {request.path} -> {response.status_code} ({duration}ms) | {user_str} | IP: {request.remote_addr}", flush=True)
    return response

# --- Helper Utilities ---
def get_current_user_id():
    return session.get('user_id')

def require_auth():
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized. Please login.'}), 401
    return None

# --- Static PWA Routes ---
@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def serve_service_worker():
    response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache'
    return response

# --- Web Page Views ---
@app.route('/')
def home():
    if not get_current_user_id():
        return redirect(url_for('login_view'))
    return render_template('index.html')

@app.route('/login')
def login_view():
    if get_current_user_id():
        return redirect(url_for('home'))
    return render_template('login.html')

@app.route('/register')
def register_view():
    if get_current_user_id():
        return redirect(url_for('home'))
    return render_template('register.html')

@app.route('/guardian/<guardian_code>')
def guardian_view(guardian_code):
    return render_template('guardian.html', guardian_code=guardian_code)

# --- Authentication APIs ---
@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    password = data.get('password', '')

    if not name or not email or not phone or not password:
        return jsonify({'error': 'All fields are required.'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters long.'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Email is already registered. Please log in.'}), 409

    guardian_code = 'SH-' + secrets.token_hex(3).upper()
    hashed = generate_password_hash(password)

    cursor.execute('''
        INSERT INTO users (name, email, phone, password_hash, guardian_code)
        VALUES (?, ?, ?, ?, ?)
    ''', (name, email, phone, hashed, guardian_code))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    session['user_id'] = user_id
    session['user_name'] = name
    session['guardian_code'] = guardian_code

    return jsonify({
        'success': True,
        'message': 'Account created successfully!',
        'user': {'id': user_id, 'name': name, 'email': email, 'guardian_code': guardian_code}
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone, password_hash, guardian_code FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'No account found with this email. Please tap "Create Account" to register.'}), 401

    clean_pass = password.strip() if isinstance(password, str) else ''
    if not (check_password_hash(user['password_hash'], password) or check_password_hash(user['password_hash'], clean_pass)):
        return jsonify({'error': 'Incorrect password. Please check your credentials.'}), 401

    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['guardian_code'] = user['guardian_code']

    return jsonify({
        'success': True,
        'message': 'Welcome back, ' + user['name'] + '!',
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'phone': user['phone'],
            'guardian_code': user['guardian_code']
        }
    })

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'authenticated': False}), 200

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone, guardian_code, last_battery_level, last_latitude, last_longitude, created_at FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()

    cursor.execute("SELECT COUNT(*) as contact_count FROM emergency_contacts WHERE user_id = ?", (user_id,))
    contact_count = cursor.fetchone()['contact_count']
    conn.close()

    if not user:
        session.clear()
        return jsonify({'authenticated': False}), 200

    return jsonify({
        'authenticated': True,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'phone': user['phone'],
            'guardian_code': user['guardian_code'],
            'last_battery_level': user['last_battery_level'] if user['last_battery_level'] is not None else 90,
            'last_latitude': user['last_latitude'],
            'last_longitude': user['last_longitude'],
            'contact_count': contact_count
        }
    })

@app.route('/api/auth/profile', methods=['PUT'])
def update_profile():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    current_password = data.get('current_password', '').strip()
    new_password = data.get('new_password', '').strip()

    if not name:
        return jsonify({'error': 'Name cannot be empty.'}), 400
    if not phone:
        return jsonify({'error': 'Phone number cannot be empty.'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone, password_hash, guardian_code FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'User not found.'}), 404

    # Handle optional password update
    if new_password:
        if not current_password:
            conn.close()
            return jsonify({'error': 'Current password is required to change your password.'}), 400
        if not check_password_hash(user['password_hash'], current_password):
            conn.close()
            return jsonify({'error': 'Current password is incorrect.'}), 400
        if len(new_password) < 6:
            conn.close()
            return jsonify({'error': 'New password must be at least 6 characters.'}), 400

        new_hash = generate_password_hash(new_password)
        cursor.execute("UPDATE users SET name = ?, phone = ?, password_hash = ? WHERE id = ?", (name, phone, new_hash, user_id))
    else:
        cursor.execute("UPDATE users SET name = ?, phone = ? WHERE id = ?", (name, phone, user_id))

    conn.commit()
    session['user_name'] = name

    # Fetch updated record
    cursor.execute("SELECT id, name, email, phone, guardian_code FROM users WHERE id = ?", (user_id,))
    updated_user = dict(cursor.fetchone())
    conn.close()

    return jsonify({
        'success': True,
        'message': 'Profile updated successfully!',
        'user': updated_user
    })

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully.'})

# --- Emergency Contacts APIs (Max 5 Contacts) ---
@app.route('/api/contacts', methods=['GET'])
def get_contacts():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, email, relation FROM emergency_contacts WHERE user_id = ? ORDER BY id ASC", (user_id,))
    contacts = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'contacts': contacts, 'count': len(contacts), 'max': 5})

@app.route('/api/contacts', methods=['POST'])
def add_contact():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()
    relation = data.get('relation', 'Guardian').strip()

    if not name or not phone:
        return jsonify({'error': 'Name and phone number are required.'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM emergency_contacts WHERE user_id = ?", (user_id,))
    if cursor.fetchone()['cnt'] >= 5:
        conn.close()
        return jsonify({'error': 'Maximum limit of 5 trusted contacts reached.'}), 400

    cursor.execute('''
        INSERT INTO emergency_contacts (user_id, name, phone, email, relation)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, name, phone, email, relation))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return jsonify({'success': True, 'message': 'Contact added successfully!', 'id': new_id}), 201

@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
def delete_contact(contact_id):
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?", (contact_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'message': 'Contact removed successfully.'})

@app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
def update_contact(contact_id):
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()
    relation = data.get('relation', 'Guardian').strip()

    if not name or not phone:
        return jsonify({'error': 'Name and phone number are required.'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verify contact belongs to user
    cursor.execute("SELECT id FROM emergency_contacts WHERE id = ? AND user_id = ?", (contact_id, user_id))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Emergency contact not found.'}), 404

    cursor.execute('''
        UPDATE emergency_contacts
        SET name = ?, phone = ?, email = ?, relation = ?
        WHERE id = ? AND user_id = ?
    ''', (name, phone, email, relation, contact_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': 'Guardian contact updated successfully!',
        'contact': {
            'id': contact_id,
            'name': name,
            'phone': phone,
            'email': email,
            'relation': relation
        }
    })

# --- SOS Alert & History APIs ---
@app.route('/api/sos/trigger', methods=['POST'])
def trigger_sos():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')
    accuracy = data.get('accuracy', 0)
    try:
        battery = int(data.get('battery_level', 90))
    except (ValueError, TypeError):
        battery = 90
    trigger_type = data.get('trigger_type', 'manual') # 'manual', 'shake', 'voice', 'checkin_timeout'

    conn = get_db()
    cursor = conn.cursor()

    # Ensure lat & lng are never null on mobile: fallback to last recorded coordinates or campus area
    if not lat or not lng:
        cursor.execute("SELECT last_latitude, last_longitude FROM users WHERE id = ?", (user_id,))
        last_coords = cursor.fetchone()
        if last_coords and last_coords['last_latitude'] and last_coords['last_longitude']:
            lat = last_coords['last_latitude']
            lng = last_coords['last_longitude']
        else:
            lat = 18.6186
            lng = 73.7482

    # Log the SOS Event
    cursor.execute('''
        INSERT INTO sos_events (user_id, latitude, longitude, accuracy, battery_level, trigger_type, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
    ''', (user_id, lat, lng, accuracy, battery, trigger_type))

    # Also sync latest telemetry to users profile
    cursor.execute('''
        UPDATE users
        SET last_battery_level = ?,
            last_latitude = COALESCE(?, last_latitude),
            last_longitude = COALESCE(?, last_longitude),
            last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (battery, lat, lng, user_id))
    conn.commit()
    event_id = cursor.lastrowid

    # Retrieve User and Contacts
    cursor.execute("SELECT name, phone, guardian_code FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    user = dict(user_row) if user_row else {}

    cursor.execute("SELECT name, phone, email FROM emergency_contacts WHERE user_id = ?", (user_id,))
    contacts = [dict(c) for c in cursor.fetchall()]
    conn.close()

    # Generate Google Maps Coordinate link (always valid, never "unavailable")
    maps_link = f"https://www.google.com/maps?q={lat},{lng}"

    guardian_code = user.get('guardian_code', '')
    guardian_url = f"{request.host_url}guardian/{guardian_code}" if guardian_code else request.host_url

    sos_msg = (
        f"🚨 *EMERGENCY SOS ALERT from {user.get('name', 'User')}!*\n"
        f"I need immediate help! My current live location is:\n{maps_link}\n"
        f"Battery: {battery}% | Trigger: {trigger_type.upper()}\n"
        f"Guardian Live Tracker: {guardian_url}"
    )

    # Format direct WhatsApp and SMS communication links
    contact_links = []
    for c in contacts:
        raw_phone = c['phone'].replace(' ', '').replace('-', '').replace('+', '')
        # Clean phone format
        wa_url = f"https://wa.me/{raw_phone}?text={requests.utils.quote(sos_msg)}"
        sms_url = f"sms:{raw_phone}?body={requests.utils.quote(sos_msg)}"
        contact_links.append({
            'name': c['name'],
            'phone': c['phone'],
            'whatsapp_url': wa_url,
            'sms_url': sms_url
        })

    # Trigger Automated Background SMS via Fast2SMS API to all guardians
    guardian_phones = [c['phone'] for c in contacts if c.get('phone')]
    guardian_url = f"{request.host_url}guardian/{user['guardian_code']}" if user and user.get('guardian_code') else request.host_url
    if guardian_phones:
        threading.Thread(
            target=send_automated_fast2sms,
            args=(guardian_phones, user['name'], maps_link, battery, trigger_type, guardian_url),
            daemon=True
        ).start()

    log_event('SOS', f"🚨 SOS DISTRESS ACTIVATED! User #{user_id} ({user['name']}) | Mode: {trigger_type.upper()} | Battery: {battery}% | GPS: {lat},{lng} | Fast2SMS: {len(guardian_phones)} recipients", level="ALERT")

    return jsonify({
        'success': True,
        'event_id': event_id,
        'message': 'SOS alert triggered and registered successfully.',
        'maps_link': maps_link,
        'sos_text': sos_msg,
        'auto_sms_dispatched': ENABLE_FAST2SMS and len(guardian_phones) > 0,
        'auto_sms_count': len(guardian_phones),
        'contact_links': contact_links,
        'helplines': [
            {'name': 'National Emergency', 'number': '112'},
            {'name': 'Women Helpline', 'number': '1091'},
            {'name': 'Police Control', 'number': '100'}
        ]
    })

@app.route('/api/sos/cancel/<int:event_id>', methods=['POST'])
def cancel_sos(event_id):
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE sos_events SET status = 'cancelled' WHERE id = ? AND user_id = ?", (event_id, user_id))
    conn.commit()
    conn.close()

    log_event('SOS', f"SOS #{event_id} marked as CANCELLED by User #{user_id}")
    return jsonify({'success': True, 'message': 'SOS alert marked as cancelled.'})

@app.route('/api/sos/history', methods=['GET'])
def sos_history():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, latitude, longitude, accuracy, battery_level, trigger_type, status, timestamp
        FROM sos_events
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 20
    ''', (user_id,))
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'history': history})

# --- Real-Time Telemetry & Device Battery Sync API ---
@app.route('/api/telemetry/update', methods=['POST'])
def update_telemetry():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    raw_batt = data.get('battery_level')
    lat = data.get('latitude')
    lng = data.get('longitude')

    try:
        battery = int(raw_batt) if raw_batt is not None else None
    except (ValueError, TypeError):
        battery = None

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users
        SET last_battery_level = COALESCE(?, last_battery_level),
            last_latitude = COALESCE(?, last_latitude),
            last_longitude = COALESCE(?, last_longitude),
            last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (battery, lat, lng, user_id))
    conn.commit()
    conn.close()

    log_event('TELEMETRY', f"User #{user_id} synced telemetry | Battery: {battery}% | GPS: {lat},{lng}")
    return jsonify({'success': True, 'synced_battery': battery, 'latitude': lat, 'longitude': lng})

@app.route('/api/telemetry/status', methods=['GET'])
def get_telemetry_status():
    """Returns the user's latest synced battery level and last known GPS coordinates."""
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT last_battery_level, last_latitude, last_longitude, last_seen FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'battery_level': row['last_battery_level'],
        'latitude': row['last_latitude'],
        'longitude': row['last_longitude'],
        'last_seen': row['last_seen']
    })

@app.route('/api/telemetry/ip-locate', methods=['GET', 'POST'])
def ip_locate():
    """Returns city-level coordinates using client IP address or profile without needing browser permissions."""
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    user_id = get_current_user_id()
    lat = 18.6186
    lng = 73.7482
    city = "Tathawade, Pune"
    source = "campus_default"

    if user_id:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT last_latitude, last_longitude FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row and row['last_latitude'] and row['last_longitude']:
            lat = row['last_latitude']
            lng = row['last_longitude']
            source = "saved_profile"

    if client_ip and client_ip not in ('127.0.0.1', 'localhost', '::1'):
        try:
            resp = requests.get(f"https://ipapi.co/{client_ip}/json/", timeout=3)
            if resp.status_code == 200:
                d = resp.json()
                if d.get('latitude') and d.get('longitude'):
                    lat = float(d['latitude'])
                    lng = float(d['longitude'])
                    city = d.get('city', 'Pune')
                    source = "ip_network"
        except Exception:
            pass

    return jsonify({
        'success': True,
        'latitude': lat,
        'longitude': lng,
        'city': city,
        'source': source
    })

# --- Journey Safety Check-In APIs ---
@app.route('/api/checkin/start', methods=['POST'])
def start_checkin():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    duration_minutes = int(data.get('duration_minutes', 15))
    destination = data.get('destination', 'Home/Commute').strip()
    transport_mode = data.get('transport_mode', 'walking').strip() # 'walking', 'cab', 'auto', 'bus'
    vehicle_no = data.get('vehicle_no', '').strip().upper()
    lat = data.get('latitude')
    lng = data.get('longitude')

    try:
        battery = int(data.get('battery_level', 90))
    except (ValueError, TypeError):
        battery = 90

    now = datetime.datetime.now()
    expires_at = now + datetime.timedelta(minutes=duration_minutes)

    conn = get_db()
    cursor = conn.cursor()
    # Mark old running checkins as superseded
    cursor.execute("UPDATE checkins SET status = 'superseded' WHERE user_id = ? AND status = 'running'", (user_id,))
    cursor.execute('''
        INSERT INTO checkins (user_id, destination, duration_minutes, transport_mode, vehicle_no, battery_level, start_lat, start_lng, status, started_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
    ''', (user_id, destination, duration_minutes, transport_mode, vehicle_no, battery, lat, lng, now.strftime('%Y-%m-%d %H:%M:%S'), expires_at.strftime('%Y-%m-%d %H:%M:%S')))
    
    # Also sync latest telemetry to users profile
    cursor.execute('''
        UPDATE users
        SET last_battery_level = ?,
            last_latitude = COALESCE(?, last_latitude),
            last_longitude = COALESCE(?, last_longitude),
            last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (battery, lat, lng, user_id))
    conn.commit()
    checkin_id = cursor.lastrowid

    # Retrieve user info for live trip sharing
    cursor.execute("SELECT name, guardian_code FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()

    # Pre-formatted Live Trip Share Message with Exact Battery Percentage
    vehicle_text = f" | Vehicle: {vehicle_no}" if vehicle_no else ""
    share_msg = (
        f"🚕 *SafeHer Journey Started by {user['name']}*\n"
        f"Destination: {destination} ({transport_mode.title()}){vehicle_text}\n"
        f"Battery: {battery}%\n"
        f"Safety Check-In Timer: {duration_minutes} mins\n"
        f"Live Guardian Tracker: {request.host_url}guardian/{user['guardian_code']}\n"
        f"Auto-SOS will trigger if not confirmed safe."
    )
    share_url = f"https://api.whatsapp.com/send?text={requests.utils.quote(share_msg)}"

    return jsonify({
        'success': True,
        'checkin_id': checkin_id,
        'duration_minutes': duration_minutes,
        'destination': destination,
        'transport_mode': transport_mode,
        'vehicle_no': vehicle_no,
        'battery_level': battery,
        'expires_at': expires_at.isoformat(),
        'trip_share_url': share_url,
        'trip_share_text': share_msg
    })

@app.route('/api/checkin/extend/<int:checkin_id>', methods=['POST'])
def extend_checkin(checkin_id):
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    data = request.get_json() or {}
    extra_minutes = int(data.get('extra_minutes', 5))

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT duration_minutes, expires_at FROM checkins WHERE id = ? AND user_id = ? AND status = 'running'", (checkin_id, user_id))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Active check-in session not found.'}), 404

    curr_exp_str = row['expires_at']
    try:
        curr_exp = datetime.datetime.strptime(curr_exp_str, '%Y-%m-%d %H:%M:%S')
    except Exception:
        curr_exp = datetime.datetime.now()

    new_exp = curr_exp + datetime.timedelta(minutes=extra_minutes)
    new_duration = row['duration_minutes'] + extra_minutes

    cursor.execute('''
        UPDATE checkins
        SET duration_minutes = ?, expires_at = ?
        WHERE id = ? AND user_id = ?
    ''', (new_duration, new_exp.strftime('%Y-%m-%d %H:%M:%S'), checkin_id, user_id))
    conn.commit()
    conn.close()

    seconds_left = max(0, int((new_exp - datetime.datetime.now()).total_seconds()))

    return jsonify({
        'success': True,
        'message': f'Timer extended by +{extra_minutes} minutes.',
        'new_duration': new_duration,
        'expires_at': new_exp.isoformat(),
        'seconds_left': seconds_left
    })

@app.route('/api/checkin/safe/<int:checkin_id>', methods=['POST'])
def mark_checkin_safe(checkin_id):
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE checkins
        SET status = 'safe', resolved_at = ?
        WHERE id = ? AND user_id = ?
    ''', (now, checkin_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'message': 'Status marked safe. Journey check-in completed.'})

@app.route('/api/checkin/escalate/<int:checkin_id>', methods=['POST'])
def escalate_checkin(checkin_id):
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE checkins
        SET status = 'escalated', resolved_at = ?
        WHERE id = ? AND user_id = ?
    ''', (now, checkin_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'message': 'Check-in escalated to SOS.'})

@app.route('/api/checkin/history', methods=['GET'])
def checkin_history():
    auth_err = require_auth()
    if auth_err: return auth_err

    user_id = get_current_user_id()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, destination, duration_minutes, transport_mode, vehicle_no, status, started_at, resolved_at
        FROM checkins
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 10
    ''', (user_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return jsonify({'success': True, 'history': rows})

# --- Guardian Dashboard Status API ---
@app.route('/api/guardian/status/<guardian_code>', methods=['GET'])
def guardian_status(guardian_code):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, last_battery_level, last_latitude, last_longitude, last_seen, created_at FROM users WHERE guardian_code = ?", (guardian_code,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'Guardian code not found.'}), 404

    # Latest SOS event
    cursor.execute('''
        SELECT latitude, longitude, accuracy, battery_level, trigger_type, status, timestamp
        FROM sos_events
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
    ''', (user['id'],))
    latest_sos = cursor.fetchone()

    # Active Checkin
    cursor.execute('''
        SELECT destination, duration_minutes, transport_mode, vehicle_no, battery_level, start_lat, start_lng, status, started_at, expires_at
        FROM checkins
        WHERE user_id = ? AND status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
    ''', (user['id'],))
    active_checkin = cursor.fetchone()

    # Emergency contacts
    cursor.execute("SELECT name, phone, relation FROM emergency_contacts WHERE user_id = ?", (user['id'],))
    contacts = [dict(c) for c in cursor.fetchall()]
    conn.close()

    # Determine real-time exact battery level
    # Priority: Active SOS -> Active Journey Checkin -> User Profile Telemetry -> Past SOS -> 90 fallback
    effective_battery = None
    if latest_sos and latest_sos['status'] == 'active' and latest_sos['battery_level'] is not None:
        effective_battery = latest_sos['battery_level']
    elif active_checkin and active_checkin['battery_level'] is not None:
        effective_battery = active_checkin['battery_level']
    elif user['last_battery_level'] is not None:
        effective_battery = user['last_battery_level']
    elif latest_sos and latest_sos['battery_level'] is not None:
        effective_battery = latest_sos['battery_level']

    # Determine best known coordinates
    best_lat = None
    best_lng = None
    if latest_sos and latest_sos['latitude'] and latest_sos['longitude']:
        best_lat = latest_sos['latitude']
        best_lng = latest_sos['longitude']
    elif active_checkin and active_checkin['start_lat'] and active_checkin['start_lng']:
        best_lat = active_checkin['start_lat']
        best_lng = active_checkin['start_lng']
    elif user['last_latitude'] and user['last_longitude']:
        best_lat = user['last_latitude']
        best_lng = user['last_longitude']

    return jsonify({
        'user': {
            'name': user['name'],
            'phone': user['phone'],
            'guardian_code': guardian_code,
            'last_seen': user['last_seen']
        },
        'battery_level': effective_battery,
        'latitude': best_lat,
        'longitude': best_lng,
        'latest_sos': dict(latest_sos) if latest_sos else None,
        'active_checkin': dict(active_checkin) if active_checkin else None,
        'contacts': contacts
    })

# --- AI Safety Assistant API (Google Gemini with Multilingual Fallback) ---
@app.route('/api/assistant/chat', methods=['POST'])
def assistant_chat():
    data = request.get_json() or {}
    user_query = data.get('query', '').strip()
    language = data.get('language', 'en').lower() # 'en', 'mr', 'hi'

    if not user_query:
        return jsonify({'error': 'Query message is required.'}), 400

    api_key = (os.environ.get('GEMINI_API_KEY') or '').strip()
    # Auto-heal accidental 0 (zero) vs O (capital letter O) typo in key if present
    if 'E0Jp' in api_key:
        api_key = api_key.replace('E0Jp', 'EOJp')

    print(f"[GEMINI] Incoming chat query, key present: {bool(api_key)}, key prefix: {api_key[:6] if api_key else 'None'}", flush=True)

    # If Gemini API key is available, query Google Gemini REST endpoint
    if api_key:
        try:
            prompt_system = (
                "You are SafeHer AI (सेफहर एआय), an elite, highly trained personal safety guardian, emergency psychologist, and women's tactical defense strategist.\n"
                "Your mission: Protect the user with calm, immediate, authoritative, and life-saving guidance in real-time.\n\n"
                "CORE OPERATIONAL PRINCIPLES:\n"
                "1. TONE & PSYCHOLOGY: Always begin with an immediate reassuring and grounding statement ('I am with you. Stay calm, breathe, and follow these exact steps.'). Dissolve panic immediately.\n"
                "2. ACTION-ORIENTED TACTICS: Provide 3 to 4 prioritized, concrete physical actions. Never give vague advice like 'be alert'. Give exact moves (e.g. 'Divert into the nearest open shop, 24/7 chemist, or bank ATM—they have CCTV and security', 'Never lead a follower to your home doorstep', 'Pretend you are on a loud video call with a police officer or family').\n"
                "3. DOMAIN EXPERTISE IN CRITICAL SCENARIOS:\n"
                "   • STALKER / FOOT PURSUIT: Cross the road to confirm if they follow; enter a populated establishment; never take dark shortcuts; face them assertively from a safe distance if confronted.\n"
                "   • CAB / AUTO RIDES: If the driver deviates, immediately speak loudly on phone stating cab number: 'Yes Dad, I am in cab MH12-XX-1234 on Pune Bypass, reaching in 5 mins'; demand the vehicle stop at the next signal; unlock doors immediately.\n"
                "   • PUBLIC TRANSIT / METRO / BUS HARASSMENT: Use a sharp, commanding voice ('Stop! / थांबा! / रुको!'); draw public attention; move near the driver or station guard; document or ask a fellow commuter to record.\n"
                "   • ELEVATOR / ISOLATED SPACES: Stand near the control panel; press multiple buttons to open doors; step out immediately if uncomfortable.\n"
                "   • LEGAL RIGHTS IN INDIA: Cite Zero FIR (women can file an FIR at ANY police station irrespective of jurisdiction), Section 354D (Stalking law), and Supreme Court safety guidelines.\n"
                "4. EMERGENCY PROTOCOL:\n"
                "   • Clearly highlight primary helplines: 112 (Pan-India Emergency), 1091 (Women Helpline), 1090 (Women Power Line), and 181 (Domestic Helpline).\n"
                "   • Remind them that SafeHer AI has an instant 1-tap SOS and live GPS tracker.\n"
                f"5. LANGUAGE REQUIREMENT: You MUST reply STRICTLY and fluently in the requested language: {language} ('mr' = Marathi, 'hi' = Hindi, 'en' = English).\n"
                "   • If Marathi ('mr'): Use authentic, warm, reassuring, grammatically natural Marathi (उदा. 'घाबरू नका, मी तुमच्या सोबत आहे...', 'तातडीने ११२ किंवा १०९१ वर कॉल करा').\n"
                "   • If Hindi ('hi'): Use respectful, high-clarity, confident Hindi (उदा. 'घबराएं नहीं, शांत रहें और तुरंत ये कदम उठाएं...').\n"
                "   • If English ('en'): Crisp, formatted with bold highlights, bullets, and emergency numbers.\n"
                "   • If user query is in Maranglish or Hinglish, understand their distress and reply in the selected language {language}."
            )
            models_to_try = [
                'gemini-3.5-flash-lite',
                'gemma-4-26b-a4b-it',
                'gemini-3-flash-preview',
                'gemini-3.5-flash'
            ]
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"{prompt_system}\n\nUser Question: {user_query}"}
                        ]
                    }
                ]
            }

            for model_name in models_to_try:
                try:
                    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    resp = requests.post(gemini_url, json=payload, timeout=20)
                    print(f"[GEMINI] Model: {model_name}, HTTP Status: {resp.status_code}", flush=True)
                    if resp.status_code == 200:
                        result = resp.json()
                        for cand in result.get('candidates', []):
                            for part in cand.get('content', {}).get('parts', []):
                                if 'text' in part and part['text']:
                                    return jsonify({
                                        'response': part['text'],
                                        'source': 'Google Gemini AI',
                                        'language': language
                                    })
                    else:
                        print(f"[GEMINI ERROR] Status {resp.status_code}: {resp.text[:200]}", flush=True)
                except Exception as ex:
                    print(f"[GEMINI EXCEPTION] Model {model_name}: {ex}", flush=True)
                    continue
        except Exception as e:
            print(f"[GEMINI OUTSIDE EXCEPTION] {e}", flush=True)
            pass

    # Intelligent Local Fallback Engine (Runs offline / without API key!)
    q = user_query.lower()
    fallback_response = ""

    if language == 'mr':
        if any(w in q for w in ['पाठलाग', 'मागून', 'follow', 'stalker', 'मागे']):
            fallback_response = (
                "🛡️ **घाबरू नका, मी तुमच्या सोबत आहे. शांत राहा आणि ताबडतोब हे करा:**\n"
                "1. **थेट घरी जाऊ नका:** रस्ता ओलांडून दिशा बदला. जवळच्या उघड्या दुकानात, पेट्रोल पंपावर किंवा बँकेच्या ATM मध्ये जा (तिथे CCTV व सुरक्षा रक्षक असतात).\n"
                "2. **मोठ्या आवाजात फोनवर बोला:** 'हो बाबा, मी पोलीस चौकीजवळच आहे, लगेच येते' असे फोनवर मोठ्याने बोला.\n"
                "3. **SafeHer AI चा SOS दाबा:** तुमच्या पालकांना लाइव्ह लोकेशन पोहोचेल.\n"
                "4. **तात्काळ संपर्क:** **११२** (आपत्कालीन) किंवा **१०९१** (महिला हेल्पलाइन) वर कॉल करा."
            )
        elif any(w in q for w in ['कॅब', 'रिक्षा', 'गाडी', 'cab', 'auto', 'driver', 'uber', 'ola']):
            fallback_response = (
                "🚖 **कॅब/रिक्षा प्रवासात धोक्याचा इशारा - तात्काळ पावले:**\n"
                "1. **मोठ्या आवाजात गाडीचा नंबर सांगा:** फोनवर बोला: 'हो मी MH-12 गाडीत बसले आहे, लाइव्ह लोकेशन पाठवले आहे'.\n"
                "2. **चालकाला ठामपणे सांगा:** 'हा रस्ता चुकीचा आहे, लगेच गाडी मुख्य रस्त्याकडे वळवा किंवा सिग्नलला थांबवा'.\n"
                "3. **दरवाजा लॉक तपासा:** हात नेहमी दरवाजाच्या हँडलवर ठेवा, सिग्नल आल्यावर खाली उतरायला तयार राहा.\n"
                "4. **११२ वर डायल करा:** धोका वाटल्यास संकोच न बाळगता लगेच ११२ कॉल लावा."
            )
        elif any(w in q for w in ['हक्क', 'कायदा', 'rights', 'police', 'fir', 'पोलीस']):
            fallback_response = (
                "⚖️ **महिलांचे भारतीय कायदेशीर अधिकार (Legal Rights):**\n"
                "1. **Zero FIR चा अधिकार:** घटना कुठेही घडली असली तरी तुम्ही कोणत्याही पोलीस स्टेशनमध्ये Zero FIR नोंदवू शकता.\n"
                "2. **कलम ३५४-डी (Stalking):** प्रत्यक्ष किंवा सोशल मीडियावर पाठलाग करणे हा दखलपात्र गुन्हा आहे.\n"
                "3. **महिलांची चौकशी:** महिलांची चौकशी फक्त महिला पोलीस अधिकाऱ्यांच्या उपस्थितीतच होऊ शकते.\n"
                "4. **मोफत कायदेशीर मदत:** कोणत्याही मदतीसाठी **१०९१** (महिला हेल्पलाइन) किंवा **१८१** वर संपर्क साधा."
            )
        elif any(w in q for w in ['बस', 'मेट्रो', 'लोकल', 'bus', 'metro', 'छेड़छाड़', 'त्रास']):
            fallback_response = (
                "🚇 **बस / मेट्रो / सार्वजनिक ठिकाणी त्रास दिल्यास:**\n"
                "1. **मोठ्याने विरोध करा:** 'थांबा! काय करताय?' अशा शब्दांत मोठ्या आवाजात सर्वांचे लक्ष वेधून घ्या.\n"
                "2. **चालक किंवा कंडक्टरकडे जा:** तात्काळ बस चालक किंवा मेट्रो सुरक्षा रक्षकाकडे जा.\n"
                "3. **सहप्रवाशांची मदत घ्या:** आसपासच्या महिला किंवा ज्येष्ठ नागरिकांना थेट सांगा: 'काका/ताई, हा व्यक्ती मला त्रास देत आहे'.\n"
                "4. **रेकॉर्डिंग किंवा १००/११२:** पुरावा म्हणून फोटो/व्हिडिओ घ्या किंवा लगेच ११२ डायल करा."
            )
        else:
            fallback_response = (
                "🛡️ **SafeHer AI सुरक्षा सल्ला:**\n"
                "• नेहमी उजेड असलेल्या मुख्य मार्गांचा वापर करा आणि फोन हातात तयार ठेवा.\n"
                "• तुमच्या SafeHer AI वरील 'Journey Check-in' सुरू ठेवा.\n"
                "• कोणत्याही संशयास्पद प्रसंगी ११२ (आपत्कालीन) किंवा १०९१ (महिला मदत कक्ष) त्वरित उपलब्ध आहे."
            )
    elif language == 'hi':
        if any(w in q for w in ['पीछा', 'follow', 'stalker', 'पीछे']):
            fallback_response = (
                "🛡️ **घबराएं नहीं, मैं आपके साथ हूं। तुरंत ये कदम उठाएं:**\n"
                "1. **सीधे घर न जाएं:** तुरंत किसी भीड़भाड़ वाली दुकान, पेट्रोल पंप या 24/7 बैंक ATM में दाखिल हों (वहां CCTV और गार्ड होते हैं)।\n"
                "2. **जोर से फोन पर बात करें:** 'हाँ पापा, मैं बस पुलिस बूथ के पास पहुंच रही हूँ' ऐसा दिखावा करके जोर से बोलें।\n"
                "3. **SafeHer AI पर SOS दबाएं:** ताकि परिजनों को आपका लाइव GPS तुरंत मिले।\n"
                "4. **तुरंत कॉल करें:** राष्ट्रीय आपातकालीन **112** या महिला हेल्पलाइन **1091** मिलाएं।"
            )
        elif any(w in q for w in ['कैब', 'ऑटो', 'ड्राइवर', 'गाड़ी', 'cab', 'auto', 'uber', 'ola']):
            fallback_response = (
                "🚖 **कैब/ऑटो सुरक्षा - आपातकालीन निर्देश:**\n"
                "1. **गाड़ी का नंबर जोर से बोलें:** फोन पर कहें: 'हाँ मैंने लाइव लोकेशन और कैब नंबर WhatsApp कर दिया है'।\n"
                "2. **ड्राइवर को कड़े शब्दों में टोकें:** 'यह गलत रास्ता है, तुरंत मुख्य सड़क की ओर गाड़ी मोड़ें'।\n"
                "3. **दरवाजे पर नजर रखें:** हाथ दरवाजे के लॉक पर रखें और अगले रेड लाइट या भीड़ में उतरने को तैयार रहें।\n"
                "4. **112 पर कॉल करें:** किसी भी संदिग्ध हरकत पर बिना झिझक 112 डायल करें।"
            )
        elif any(w in q for w in ['कानून', 'अधिकार', 'rights', 'police', 'fir', 'पुलिस']):
            fallback_response = (
                "⚖️ **भारत में महिलाओं के कानूनी अधिकार (Legal Rights):**\n"
                "1. **Zero FIR का अधिकार:** घटना कहीं भी हुई हो, किसी भी नजदीकी पुलिस स्टेशन में बिना क्षेत्राधिकार विवाद के FIR दर्ज कराई जा सकती है।\n"
                "2. **धारा 354D (Stalking):** पीछा करना या ऑनलाइन तंग करना गैर-जमानती व दंडनीय अपराध है।\n"
                "3. **महिला पुलिस की मौजूदगी:** किसी भी महिला से पूछताछ केवल महिला पुलिसकर्मी की उपस्थिति में ही हो सकती है।\n"
                "4. **राष्ट्रीय हेल्पलाइन:** तत्काल कानूनी सहायता के लिए **1091** या **181** पर कॉल करें।"
            )
        else:
            fallback_response = (
                "🛡️ **SafeHer AI सुरक्षा निर्देश:**\n"
                "• सुनसान रास्तों से बचें और हमेशा अच्छी रोशनी वाली सड़कों का इस्तेमाल करें।\n"
                "• यात्रा के दौरान 'Journey Check-in' एक्टिव रखें।\n"
                "• आपातकाल में तुरंत **112** (आपातकालीन) या **1091** (महिला सुरक्षा) डायल करें।"
            )
    else: # English
        if any(w in q for w in ['follow', 'stalk', 'behind', 'shadow', 'pursue']):
            fallback_response = (
                "🛡️ **Stay calm, I am right here with you. Follow these exact tactical steps:**\n"
                "1. **DO NOT head home:** Do not lead a pursuer to your doorstep. Cross the street to confirm their intent, then divert immediately into a populated store, restaurant, or 24/7 bank ATM (with CCTV & guard).\n"
                "2. **Make a loud assertive phone call:** Speak clearly: 'Yes Dad/Officer, I am right outside the petrol pump, I see you ahead.' This instantly deters stalkers.\n"
                "3. **Trigger SafeHer AI SOS:** Broadcast your live coordinates to your guardians in 1 tap.\n"
                "4. **Dial Helplines:** Immediately call **112** (National Emergency) or **1091** (Women Helpline)."
            )
        elif any(w in q for w in ['cab', 'taxi', 'uber', 'ola', 'driver', 'auto', 'ride']):
            fallback_response = (
                "🚖 **Cab / Ride Threat Protocol:**\n"
                "1. **Loudly announce vehicle details:** Call someone or pretend to call, stating: 'I am in vehicle MH12-XX-1234 on Highway, sharing my live GPS now.'\n"
                "2. **Assertive command:** Say firmly: 'Stop the car here. This is not my route.' Do not ask politely—sound commanding.\n"
                "3. **Check door locks:** Keep your fingers ready on the manual door latch; prepare to attract attention or exit at the next traffic light.\n"
                "4. **Immediate Emergency:** Dial **112** or trigger SafeHer AI SOS."
            )
        elif any(w in q for w in ['right', 'rights', 'law', 'legal', 'police', 'fir', 'ipc', 'bns']):
            fallback_response = (
                "⚖️ **Your Essential Legal Rights Under Indian Law:**\n"
                "1. **Zero FIR:** You can lodge an FIR at ANY police station regardless of where the incident occurred. The police CANNOT refuse.\n"
                "2. **Anti-Stalking Law (Section 354D):** Physical or electronic stalking/monitoring is a recognized criminal offense.\n"
                "3. **Presence of Female Officers:** Women cannot be arrested after sunset or before sunrise except in extraordinary circumstances with a magistrate's order, and only female police officers can examine female complainants.\n"
                "4. **Helpline Numbers:** Dial **112** (All emergencies), **1091** (Women in Distress), or **181** (Domestic Abuse Support)."
            )
        elif any(w in q for w in ['bus', 'metro', 'train', 'public', 'harass', 'eve']):
            fallback_response = (
                "🚇 **Public Transit Harassment Protocol:**\n"
                "1. **Speak up loudly:** Make eye contact and state in a clear, commanding voice: 'Step back! Keep your hands to yourself.' Bystanders act once silence is broken.\n"
                "2. **Move to safety zones:** In metros, move into the designated Women's Coach; on buses, move immediately next to the driver/conductor.\n"
                "3. **Recruit an ally:** Look directly at a fellow woman or senior commuter and say: 'Please help me, this person is harassing me.'\n"
                "4. **Emergency reporting:** Use emergency pull-cords or dial **112** at the next stop."
            )
        else:
            fallback_response = (
                "🛡️ **SafeHer AI Proactive Safety Advisory:**\n"
                "• Keep one ear free from headphones when walking alone at night to stay aware of surroundings.\n"
                "• Keep your phone charged above 20% and use SafeHer AI Journey Check-In during commutes.\n"
                "• Quick helpline dialers (**112** & **1091**) and instant **SOS** are 1 tap away on your home screen."
            )

    return jsonify({
        'response': fallback_response,
        'source': 'SafeHer Smart Safety Knowledge Base',
        'language': language
    })

# --- Offline Safety Tips API ---
@app.route('/api/tips', methods=['GET'])
def get_safety_tips():
    lang = request.args.get('lang', 'en').lower()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT category, title, content FROM safety_tips WHERE language = ?", (lang,))
    tips = [dict(t) for t in cursor.fetchall()]
    conn.close()

    return jsonify({'tips': tips, 'language': lang})

# --- Healthcheck & Diagnostic Route ---
@app.route('/api/gemini-check', methods=['GET'])
def gemini_check():
    k = (os.environ.get('GEMINI_API_KEY') or '').strip()
    if 'E0Jp' in k:
        k = k.replace('E0Jp', 'EOJp')
    if not k:
        return jsonify({
            'status': 'error',
            'message': 'GEMINI_API_KEY environment variable is missing on this server.'
        }), 500

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={k}"
        resp = requests.post(
            url,
            json={'contents': [{'parts': [{'text': 'Hello, system active test.'}]}]},
            timeout=10
        )
        if resp.status_code == 200:
            return jsonify({
                'status': 'ok',
                'connected': True,
                'model': 'gemini-3.5-flash-lite',
                'message': 'Google Gemini API is connected and responding live!',
                'key_prefix': k[:7] + '...',
                'key_length': len(k)
            })
        else:
            return jsonify({
                'status': 'error',
                'connected': False,
                'http_status': resp.status_code,
                'google_error': resp.json() if 'application/json' in resp.headers.get('Content-Type', '') else resp.text[:300],
                'key_prefix': k[:7] + '...'
            }), 502
    except Exception as e:
        return jsonify({'status': 'exception', 'error': str(e)}), 500

# --- Production System Health & Activity Logs Endpoints ---
@app.route('/api/system/health', methods=['GET'])
def system_health():
    """
    Returns real-time server health, uptime, database connectivity, and active distress counters.
    Useful for Render health checks and uptime monitoring.
    """
    uptime_sec = int(time.time() - APP_START_TIME)
    hours, remainder = divmod(uptime_sec, 3600)
    mins, secs = divmod(remainder, 60)
    uptime_str = f"{hours}h {mins}m {secs}s"

    db_status = "connected"
    users_count = 0
    active_sos_count = 0
    contacts_count = 0
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM users")
        users_count = cursor.fetchone()['cnt']
        cursor.execute("SELECT COUNT(*) as cnt FROM sos_events WHERE status = 'active'")
        active_sos_count = cursor.fetchone()['cnt']
        cursor.execute("SELECT COUNT(*) as cnt FROM emergency_contacts")
        contacts_count = cursor.fetchone()['cnt']
        conn.close()
    except Exception as e:
        db_status = f"error: {str(e)}"

    return jsonify({
        'status': 'healthy' if db_status == 'connected' else 'degraded',
        'timestamp': datetime.datetime.now().isoformat(),
        'uptime': uptime_str,
        'uptime_seconds': uptime_sec,
        'database': db_status,
        'registered_users': users_count,
        'saved_contacts': contacts_count,
        'active_sos_alerts': active_sos_count,
        'environment': 'Render Production' if os.environ.get('RENDER') else 'Local / Cloud',
        'server_time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S %Z')
    })

@app.route('/api/system/logs', methods=['GET'])
def system_logs():
    """
    Returns the latest circular application logs for live operational monitoring in Render.
    Query parameter: ?limit=50 (max 100)
    """
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
    except (ValueError, TypeError):
        limit = 50

    return jsonify({
        'total_recorded_events': len(SYSTEM_LOGS),
        'displayed': min(limit, len(SYSTEM_LOGS)),
        'logs': list(reversed(SYSTEM_LOGS[-limit:])),
        'server_time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)

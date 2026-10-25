import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'safeher.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            guardian_code TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Emergency Contacts Table (max 5 per user)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS emergency_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            relation TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # SOS Events Audit Log Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sos_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            latitude REAL,
            longitude REAL,
            accuracy REAL,
            battery_level INTEGER,
            trigger_type TEXT DEFAULT 'manual',
            status TEXT DEFAULT 'active',
            notes TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Journey Safety Check-Ins Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            destination TEXT,
            duration_minutes INTEGER NOT NULL,
            status TEXT DEFAULT 'running',
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            resolved_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Safety Tips Table (Pre-seeded with English, Marathi & Hindi)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS safety_tips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            language TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL
        )
    ''')

    # Check if safety tips already seeded
    cursor.execute("SELECT COUNT(*) as cnt FROM safety_tips")
    if cursor.fetchone()['cnt'] == 0:
        seed_safety_tips(cursor)

    # Seed demo account if not present (for zero-config cloud deployments like Render)
    cursor.execute("SELECT id FROM users WHERE email = 'demo@safeher.in'")
    if not cursor.fetchone():
        from werkzeug.security import generate_password_hash
        cursor.execute('''
            INSERT INTO users (name, email, phone, password_hash, guardian_code)
            VALUES (?, ?, ?, ?, ?)
        ''', ('Sakshi Anbhule', 'demo@safeher.in', '9876543210', generate_password_hash('SafeHer@2026'), 'SH-DEMO1'))
        demo_id = cursor.lastrowid
        cursor.execute('''
            INSERT INTO emergency_contacts (user_id, name, phone, email, relation)
            VALUES (?, ?, ?, ?, ?)
        ''', (demo_id, 'Om Shinde (Guardian)', '9373545169', 'omshinde0412@gmail.com', 'Parent'))

    conn.commit()
    conn.close()

def seed_safety_tips(cursor):
    tips = [
        # English
        ('en', 'travel', 'Late Night Travel', 'Stay on well-lit main streets. Share your live location with guardians and keep SafeHer AI active.'),
        ('en', 'cab', 'Cab & Auto Safety', 'Verify driver details and vehicle number before entering. Share ride details via WhatsApp immediately.'),
        ('en', 'harassment', 'Public Harassment', 'Attract public attention immediately. Head toward crowded shops, security booths, or dial 112.'),
        ('en', 'stalking', 'Suspicious Follower', 'Do not head straight home. Change route into a busy public space or police post, and trigger SOS.'),
        
        # Marathi
        ('mr', 'travel', 'रात्रीचा प्रवास', 'नेहमी उजेड असलेल्या मुख्य रस्त्यांचा वापर करा. SafeHer AI वर तुमचे लाइव्ह लोकेशन पालकांशी शेअर करा.'),
        ('mr', 'cab', 'कॅब आणि रिक्षा सुरक्षितता', 'वाहनात बसण्यापूर्वी ड्रायव्हरचे नाव व नंबर तपासा. प्रवासाची माहिती त्वरित व्हॉट्सअॅपवर शेअर करा.'),
        ('mr', 'harassment', 'असुरक्षित परिस्थिती', 'घाबरू नका, लोकांचे लक्ष वेधून घ्या. जवळच्या गर्दीच्या ठिकाणी किंवा पोलीस चौकीकडे जा व ११२ डायल करा.'),
        ('mr', 'stalking', 'कोणी पाठलाग करत असल्यास', 'थेट घरी जाऊ नका. कोणत्याही गर्दीच्या दुकानात किंवा सार्वजनिक ठिकाणी थांबा व लगेच SOS दाबा.'),

        # Hindi
        ('hi', 'travel', 'देर रात यात्रा', 'हमेशा रोशनी वाली मुख्य सड़कों का इस्तेमाल करें। SafeHer AI से अपने परिजनों के साथ लाइव लोकेशन साझा करें।'),
        ('hi', 'cab', 'कैब व ऑटो सुरक्षा', 'सवारी में बैठने से पहले नंबर प्लेट और ड्राइवर की जांच करें। व्हाट्सएप पर तुरंत यात्रा साझा करें।'),
        ('hi', 'harassment', 'छेड़छाड़ या खतरा', 'घबराएं नहीं, तुरंत आसपास के लोगों का ध्यान आकर्षित करें। नजदीकी सुरक्षित स्थान पर जाएं और 112 मिलाएं।'),
        ('hi', 'stalking', 'संदेहास्पद पीछा', 'सीधे घर न जाएं। किसी भीड़भाड़ वाली दुकान या पुलिस स्टेशन की तरफ मुड़ें और तुरंत SOS चालू करें।')
    ]
    cursor.executemany('''
        INSERT INTO safety_tips (language, category, title, content)
        VALUES (?, ?, ?, ?)
    ''', tips)

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully!")

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, g
import os
import numpy as np
from werkzeug.security import generate_password_hash, check_password_hash
import json
from datetime import datetime, timedelta
import random
import pickle
import sqlite3
import face_recognition
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
import cv2

app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config['DATABASE'] = os.path.join(app.instance_path, 'biometric.db')
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg'}

# Crear directorios necesarios
os.makedirs(app.instance_path, exist_ok=True)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('models', exist_ok=True)

# Conexión a la base de datos
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()

if not os.path.exists(app.config['DATABASE']):
    init_db()

# Modelos ML
facial_model = None
scaler = StandardScaler()

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def process_image(file):
    # Leer imagen
    img = face_recognition.load_image_file(file)
    
    # Redimensionar para mejorar rendimiento (opcional)
    small_img = cv2.resize(img, (0, 0), fx=0.5, fy=0.5)
    
    # Obtener descriptores faciales
    face_locations = face_recognition.face_locations(small_img)
    face_encodings = face_recognition.face_encodings(small_img, face_locations)
    
    if not face_encodings:
        return None, None
    
    return face_encodings[0], face_locations[0]

@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No se proporcionaron imágenes'}), 400

        files = request.files.getlist('file')
        if len(files) < 5:
            return jsonify({'status': 'error', 'message': 'Se requieren al menos 5 imágenes'}), 400

        name = request.form.get('name')
        lastname = request.form.get('lastname')
        email = request.form.get('email')
        cedula = request.form.get('cedula') 
        password = request.form.get('password')

        if not all([name, lastname, email, password, cedula]):
            return jsonify({'status': 'error', 'message': 'Datos incompletos'}), 400

        db = get_db()
        
        # Verifica si el email o cédula ya existen
        existing_user = db.execute(
            'SELECT email, cedula FROM users WHERE email = ? OR cedula = ?', 
            (email, cedula)
        ).fetchone()

        if existing_user:
            # Determina qué campo está duplicado
            if existing_user['email'] == email:
                return jsonify({
                    'status': 'error',
                    'message': 'El email ya está registrado'
                }), 400
            else:
                return jsonify({
                    'status': 'error', 
                    'message': 'La cédula ya está registrada'
                }), 400

        # Procesar todas las imágenes
        descriptors = []
        for file in files:
            if file and allowed_file(file.filename):
                encoding, _ = process_image(file)
                if encoding is not None:
                    descriptors.append(encoding.tolist())

        if len(descriptors) < 5:
            return jsonify({'status': 'error', 'message': 'Se requieren al menos 5 imágenes válidas'}), 400

        # Insertar usuario
        cursor = db.execute(
            'INSERT INTO users (email, cedula, name, lastname, password, registered_at) VALUES (?, ?, ?, ?, ?, ?)',
            (email, cedula, name, lastname, generate_password_hash(password), datetime.now().isoformat())
        )
        user_id = cursor.lastrowid

        # Insertar descriptores faciales
        for desc in descriptors:
            db.execute(
                'INSERT INTO face_descriptors (user_id, descriptor) VALUES (?, ?)',
                (user_id, json.dumps(desc))
            )

        db.commit()
        train_facial_model()

        return jsonify({
            'status': 'success',
            'message': 'Usuario registrado correctamente',
            'user': {'id': user_id, 'name': name, 'email': email}
        })

    except Exception as e:
        db.rollback()
        return jsonify({'status': 'error', 'message': f'Error en el servidor: {str(e)}'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No se proporcionó imagen'}), 400

        file = request.files['file']
        if not file or not allowed_file(file.filename):
            return jsonify({'status': 'error', 'message': 'Formato de imagen no válido'}), 400

        current_encoding, _ = process_image(file)
        if current_encoding is None:
            return jsonify({'status': 'error', 'message': 'No se detectó ningún rostro'}), 400

        db = get_db()
        users = db.execute('SELECT id, name FROM users').fetchall()
        
        best_match = None
        min_distance = float('inf')
        
        for user in users:
            descriptors = db.execute(
                'SELECT descriptor FROM face_descriptors WHERE user_id = ?',
                (user['id'],)
            ).fetchall()
            
            for desc in descriptors:
                stored_desc = np.array(json.loads(desc['descriptor']))
                distance = np.linalg.norm(stored_desc - current_encoding)
                
                if distance < min_distance:
                    min_distance = distance
                    best_match = user

        # Umbral de reconocimiento (ajustable)
        if best_match and min_distance < 0.6:  # Puedes ajustar este valor
            session['user_id'] = best_match['id']
            return jsonify({
                'status': 'success',
                'message': f'¡Bienvenido {best_match["name"]}!',
                'user': dict(best_match)
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'No se reconoció tu rostro. ¿Quieres registrarte?',
                'distance': float(min_distance) if best_match else None
            }), 401

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# API para obtener información del usuario
@app.route('/api/user')
def get_user():
    if 'user_id' not in session:
        # Devuelve un 401 pero con un formato JSON consistente
        return jsonify({'status': 'error', 'message': 'No autorizado - sesión no válida'}), 401

    db = get_db()
    user = db.execute(
        'SELECT id, name, email, registered_at FROM users WHERE id = ?',
        (session['user_id'],)
    ).fetchone()

    if not user:
        session.pop('user_id', None)  # Limpiar sesión inválida
        return jsonify({'status': 'error', 'message': 'Usuario no encontrado'}), 404

    return jsonify({
        'status': 'success',
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'registered_at': user['registered_at']
        }
    })


def generate_historical_data():
    base = 100
    trend = 5
    seasonality = 20
    noise = 10
    
    data = []
    for i in range(20):  # 20 días de historial
        value = base + trend*i + seasonality * np.sin(i * np.pi / 7) + random.uniform(-noise, noise)
        data.append(round(value, 2))
    
    return data


# API para obtener pronóstico
@app.route('/api/forecast')
def get_forecast():
    try:
        if 'user_id' not in session:
            return jsonify({'status': 'error', 'message': 'No autorizado'}), 401

        # Generar datos históricos simulados
        historical = generate_historical_data()
        
        # Entrenar modelo de pronóstico simple
        X = np.arange(len(historical)).reshape(-1, 1)
        y = np.array(historical)
        model = LinearRegression()
        model.fit(X, y)
        
        # Predecir próximos 10 días
        future_X = np.arange(len(historical), len(historical)+10).reshape(-1, 1)
        predictions = model.predict(future_X).tolist()
        
        # Formatear fechas
        today = datetime.now()
        dates = [(today + timedelta(days=i)).strftime('%d %b') for i in range(len(historical) + 10)]
        
        return jsonify({
            'status': 'success',
            'labels': dates,
            'real_data': historical + [None]*10,
            'forecast_data': [None]*len(historical) + [round(p, 2) for p in predictions]
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Dashboard
@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('home'))
    return render_template('index.html')

# Logout
@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('home'))

# Función para entrenar modelo de reconocimiento facial
def train_facial_model():
    global facial_model, scaler
    
    db = get_db()
    users = db.execute('SELECT id FROM users').fetchall()
    
    if not users:
        return

    X = []
    y = []
    
    for user in users:
        descriptors = db.execute(
            'SELECT descriptor FROM face_descriptors WHERE user_id = ?',
            (user['id'],)
        ).fetchall()
        
        for desc in descriptors:
            X.append(np.array(json.loads(desc['descriptor'])))
            y.append(str(user['id']))
    
    if not X:
        return

    X = np.array(X)
    y = np.array(y)
    
    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)
    
    model = KNeighborsClassifier(n_neighbors=3, metric='euclidean')
    model.fit(X_scaled, y)
    
    facial_model = model
    with open('models/facial_knn.pkl', 'wb') as f:
        pickle.dump({'model': model, 'scaler': scaler}, f)
        
# API para estadísticas de comportamiento
@app.route('/api/user_behavior')
def get_user_behavior():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'No autorizado'}), 401

    db = get_db()
    
    # 1. Frecuencia de logins (últimos 30 días)
    login_days = db.execute('''
        SELECT DATE(login_time) as day, COUNT(*) as count 
        FROM (SELECT datetime(?, 'unixepoch') as login_time 
              UNION ALL 
              SELECT datetime(?, 'unixepoch') as login_time)
        GROUP BY day
        ORDER BY day DESC
        LIMIT 30
    ''', (datetime.now().timestamp(), (datetime.now() - timedelta(days=1)).timestamp())).fetchall()
    
    # 2. Horarios de acceso (distribución por hora)
    login_hours = [random.randint(0, 50) for _ in range(24)]  # Datos simulados
    
    # 3. Precisión de reconocimiento (últimos 100 intentos)
    recognition_data = {
        'success': random.randint(70, 90),
        'failure': random.randint(10, 30)
    }
    
    # 4. Tiempo promedio de autenticación
    auth_time = round(random.uniform(1.5, 3.5), 2)
    
    # 5. Distribución de similitud facial
    similarity_dist = [round(random.uniform(0.3, 0.6), 2) for _ in range(50)]
    
    return jsonify({
        'status': 'success',
        'login_frequency': [{'day': day['day'], 'count': day['count']} for day in login_days],
        'login_hours': login_hours,
        'recognition_accuracy': recognition_data,
        'auth_time': auth_time,
        'similarity_distribution': similarity_dist
    })

# API para datos de uso del sistema
@app.route('/api/system_usage')
def get_system_usage():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'No autorizado'}), 401

    # Datos simulados - en producción usarías datos reales de tu base de datos
    days = [(datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(30, -1, -1)]
    usage_data = [random.randint(50, 150) for _ in range(31)]
    
    return jsonify({
        'status': 'success',
        'labels': days,
        'usage_data': usage_data
    })


if __name__ == '__main__':
    try:
        with open('models/facial_knn.pkl', 'rb') as f:
            saved = pickle.load(f)
            facial_model = saved['model']
            scaler = saved['scaler']
    except:
        pass
    
    app.run(debug=True)
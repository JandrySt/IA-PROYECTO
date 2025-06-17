
    CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cedula TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    lastname TEXT NOT NULL,
    password TEXT NOT NULL,
    registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS face_descriptors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        descriptor BLOB NOT NULL,
        image_path TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );
    

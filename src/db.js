const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Definujeme cestu k databázovému súboru
const dbPath = path.resolve(__dirname, 'licenses.db');

// Vytvoríme pripojenie k databáze
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        return;
    }
    console.log('Connected to the SQLite database.');
    
    // Nastavenie foreign key constraints
    db.run('PRAGMA foreign_keys = ON');

    // Serializujeme vytvorenie tabuliek, aby sme mali istotu, že sa vykonajú v správnom poradí
    db.serialize(() => {
        // Vytvorenie tabuľky users
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )
        `, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
            } else {
                console.log('Users table ready');
            }
        });

        // Vytvorenie tabuľky licenses
        db.run(`
            CREATE TABLE IF NOT EXISTS licenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                created_date TEXT,
                expiry_date TEXT,
                attachment_path TEXT,
                comment TEXT
            )
        `, (err) => {
            if (err) {
                console.error('Error creating licenses table:', err);
            } else {
                console.log('Licenses table ready');
            }
        });

        // Vytvorenie tabuľky license_logs
        db.run(`
            CREATE TABLE IF NOT EXISTS license_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_id INTEGER,
                user_id INTEGER,
                action TEXT,
                timestamp TEXT,
                changes TEXT,
                FOREIGN KEY (license_id) REFERENCES licenses (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `, (err) => {
            if (err) {
                console.error('Error creating license_logs table:', err);
            } else {
                console.log('License_logs table ready');
            }
        });

        // Kontrola štruktúry databázy
        db.all(`
            SELECT name, sql FROM sqlite_master WHERE type='table'
        `, [], (err, tables) => {
            if (err) {
                console.error('Error checking database structure:', err);
            } else {
                console.log('Database structure:', tables);
            }
        });
    });
});

// Ošetrenie ukončenia pripojenia pri vypnutí aplikácie
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

// Export databázového objektu pre použitie v iných častiach aplikácie
module.exports = db;
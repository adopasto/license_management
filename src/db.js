const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Definujeme cestu k databázovému súboru
const dbPath = path.resolve(__dirname, 'licenses.db');

// Ak databáza existuje, zmažeme ju
// if (fs.existsSync(dbPath)) {
//     fs.unlinkSync(dbPath);
//     console.log('Existing database file deleted');
// }

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

        // Vytvorenie tabuľky pre vymazané licencie
        db.run(`
            CREATE TABLE IF NOT EXISTS deleted_licenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_id INTEGER,
                name TEXT,
                created_date TEXT,
                expiry_date TEXT,
                deleted_date TEXT,
                deleted_by INTEGER,
                comment TEXT,
                attachment_path TEXT,
                FOREIGN KEY (deleted_by) REFERENCES users (id)
            )
        `, (err) => {
            if (err) {
                console.error('Error creating deleted_licenses table:', err);
            } else {
                console.log('Deleted_licenses table ready');
            }
        });

        // Vytvorenie indexov pre lepší výkon
        db.run(`CREATE INDEX IF NOT EXISTS idx_license_logs_license_id ON license_logs(license_id)`, (err) => {
            if (err) {
                console.error('Error creating license_logs index:', err);
            }
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_license_logs_user_id ON license_logs(user_id)`, (err) => {
            if (err) {
                console.error('Error creating user_logs index:', err);
            }
        });

        // Kontrola štruktúry databázy
        db.all(`SELECT name, sql FROM sqlite_master WHERE type='table'`, [], (err, tables) => {
            if (err) {
                console.error('Error checking database structure:', err);
            } else {
                console.log('Database structure:', tables);
                
                // Kontrola stĺpcov v tabuľke deleted_licenses
                db.all(`PRAGMA table_info(deleted_licenses)`, [], (err, columns) => {
                    if (err) {
                        console.error('Error checking deleted_licenses columns:', err);
                    } else {
                        console.log('Deleted_licenses columns:', columns);
                    }
                });
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

// Pridanie pomocných funkcií pre prácu s logmi
db.addLog = function(licenseId, userId, action, changes, callback) {
    const timestamp = new Date().toISOString();
    this.run(
        'INSERT INTO license_logs (license_id, user_id, action, timestamp, changes) VALUES (?, ?, ?, ?, ?)',
        [licenseId, userId, action, timestamp, changes],
        callback
    );
};

// Export databázového objektu pre použitie v iných častiach aplikácie
module.exports = db;
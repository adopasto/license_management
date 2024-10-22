const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.resolve(__dirname, 'src', 'licenses.db');
const db = new sqlite3.Database(dbPath);

const saltRounds = 10;

async function addUser(username, password) {
    try {
        // Kontrola, či používateľ už existuje
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (existingUser) {
            console.log('User already exists. Updating password...');
        }

        // Vytvorenie hash-u hesla
        const hash = await bcrypt.hash(password, saltRounds);

        if (existingUser) {
            // Update existujúceho používateľa
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET password = ? WHERE username = ?', [hash, username], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            console.log('User password updated successfully');
        } else {
            // Pridanie nového používateľa
            await new Promise((resolve, reject) => {
                db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            console.log('User added successfully');
        }

        // Kontrola pridania/aktualizácie
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        console.log('Verified user in database:', {
            id: user.id,
            username: user.username,
            passwordHash: user.password.substring(0, 10) + '...'
        });

    } catch (error) {
        console.error('Error adding/updating user:', error);
    } finally {
        db.close();
    }
}

// Použitie: node add-user.js <username> <password>
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.log('Usage: node add-user.js <username> <password>');
} else {
    addUser(args[0], args[1]).catch(console.error);
}
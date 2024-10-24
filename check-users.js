const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src', 'licenses.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all('SELECT id, username FROM users', [], (err, users) => {
    if (err) {
        console.error('Error querying database:', err);
    } else {
        console.log('Users in database:');
        users.forEach(user => {
            console.log(`ID: ${user.id}, Username: ${user.username}`);
        });
    }
    db.close();
});
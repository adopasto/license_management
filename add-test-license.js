const db = require('./src/db');

function addTestLicenses() {
    const today = new Date();
    
    // Vytvoríme testovacie licencie s rôznymi expiračnými dátumami
    const testLicenses = [
        {
            name: 'Test License - 7 days',
            days: 7,
            comment: 'Critical expiration test'
        },
        {
            name: 'Test License - 30 days',
            days: 30,
            comment: 'Warning expiration test'
        },
        {
            name: 'Test License - 90 days',
            days: 90,
            comment: 'Notice expiration test'
        }
    ];

    testLicenses.forEach(license => {
        const expiryDate = new Date(today);
        expiryDate.setDate(today.getDate() + license.days);

        db.run(`
            INSERT INTO licenses (name, created_date, expiry_date, comment)
            VALUES (?, ?, ?, ?)
        `, [
            license.name,
            today.toISOString().split('T')[0],
            expiryDate.toISOString().split('T')[0],
            license.comment
        ], function(err) {
            if (err) {
                console.error(`Error adding test license "${license.name}":`, err);
            } else {
                console.log(`Added test license "${license.name}" with ID: ${this.lastID}`);
            }
        });
    });
}

addTestLicenses();

// Zatvorenie databázy po 1 sekunde (aby sa stihli vykonať všetky operácie)
setTimeout(() => {
    db.close(() => {
        console.log('Database connection closed');
    });
}, 1000);
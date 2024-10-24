const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src', 'licenses.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath);

// Funkcia na výpočet dní do expirácie
function getDaysUntilExpiry(expiryDate) {
    const today = new Date();
    const expiry = new Date(expiryDate);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

// Kontrola všetkých licencií
db.all(`SELECT * FROM licenses ORDER BY expiry_date ASC`, [], (err, licenses) => {
    if (err) {
        console.error('Error querying database:', err);
        db.close();
        return;
    }

    console.log('\nLicense Expiration Check Results:');
    console.log('=================================');
    
    if (licenses.length === 0) {
        console.log('No licenses found in database.');
    } else {
        licenses.forEach(license => {
            const daysUntilExpiry = getDaysUntilExpiry(license.expiry_date);
            let status;
            if (daysUntilExpiry < 0) {
                status = 'EXPIRED';
            } else if (daysUntilExpiry <= 7) {
                status = 'CRITICAL';
            } else if (daysUntilExpiry <= 30) {
                status = 'WARNING';
            } else if (daysUntilExpiry <= 90) {
                status = 'NOTICE';
            } else {
                status = 'OK';
            }
            
            console.log(`\nLicense: ${license.name}`);
            console.log(`Expiry Date: ${license.expiry_date}`);
            console.log(`Days until expiry: ${daysUntilExpiry}`);
            console.log(`Status: ${status}`);
        });
    }

    console.log('\nNotification Thresholds:');
    console.log('- 90 days: First warning');
    console.log('- 30 days: Second warning');
    console.log('- 7 days: Final warning');

    db.close();
});
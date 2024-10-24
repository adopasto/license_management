const nodemailer = require('nodemailer');
const db = require('./db');

// Konfigurácia emailového servera
const EMAIL_CONFIG = {
    host: 'mail.webhouse.sk',
    port: 587,
    secure: false,
    auth: {
        user: 'pastorek@privatexpyro.sk',
        pass: 'Dharma108*'
    },
    tls: {
        rejectUnauthorized: false
    },
    logger: true,
    debug: true,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
};

// Rozšírená konfigurácia notifikácií
const NOTIFICATION_CONFIG = {
    levels: {
        critical: {
            days: 7,
            emails: ['pastorek@radington.sk'],
            subject: '[KRITICKÉ] Licencia expiruje za 7 dní',
            color: '#dc3545'
        },
        warning: {
            days: 30,
            emails: ['pastorek@radington.sk'],
            subject: '[UPOZORNENIE] Licencia expiruje za 30 dní',
            color: '#ffc107'
        },
        notice: {
            days: 90,
            emails: ['pastorek@radington.sk'],
            subject: '[OZNÁMENIE] Licencia expiruje za 90 dní',
            color: '#17a2b8'
        }
    },
    emailFrom: 'pastorek@privatexpyro.sk',
    companyName: 'Private Pyro',
    replyTo: 'sales@privatexpyro.sk'
};

// Vytvorenie a správa transportéra
let transporter = null;

async function createTransporter() {
    if (transporter === null) {
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
    }
    return transporter;
}

// Overenie emailového pripojenia
async function verifyEmailConnection() {
    try {
        const testTransporter = await createTransporter();
        await testTransporter.verify();
        console.log('Email connection verified successfully');
        return true;
    } catch (error) {
        console.error('Email verification failed:', error);
        return false;
    }
}

// Hlavná funkcia pre kontrolu licencií
async function checkExpiringLicenses() {
    console.log('Starting license expiration check:', new Date().toISOString());
    const today = new Date();

    try {
        const licenses = await new Promise((resolve, reject) => {
            db.all(`
                SELECT l.*, ll.timestamp as last_notification
                FROM licenses l
                LEFT JOIN (
                    SELECT license_id, MAX(timestamp) as timestamp
                    FROM license_logs
                    WHERE action = 'notification'
                    GROUP BY license_id
                ) ll ON l.id = ll.license_id
                WHERE l.expiry_date IS NOT NULL
                ORDER BY l.expiry_date ASC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`Found ${licenses.length} licenses to check`);

        for (const license of licenses) {
            const expiryDate = new Date(license.expiry_date);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            
            console.log(`Checking license "${license.name}": ${daysUntilExpiry} days until expiry`);

            // Kontrola pre každú úroveň notifikácií
            for (const [level, config] of Object.entries(NOTIFICATION_CONFIG.levels)) {
                if (daysUntilExpiry <= config.days && shouldSendNotification(license, daysUntilExpiry, config.days)) {
                    try {
                        const emailSent = await sendExpirationEmail(license, daysUntilExpiry, config);
                        if (emailSent) {
                            await logNotification(license.id, config.days);
                            console.log(`${level} notification sent for license "${license.name}"`);
                        }
                    } catch (error) {
                        console.error(`Error sending ${level} notification for "${license.name}":`, error);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking licenses:', error);
        throw error;
    }
}

// Helper funkcia pre kontrolu či poslať notifikáciu
function shouldSendNotification(license, daysUntilExpiry, warningDays) {
    if (!license.last_notification) return true;

    const lastNotification = new Date(license.last_notification);
    const now = new Date();
    const daysSinceLastNotif = Math.ceil((now - lastNotification) / (1000 * 60 * 60 * 24));

    // Logika pre opakované notifikácie
    if (warningDays >= 90) return daysSinceLastNotif >= 30;
    if (warningDays >= 30) return daysSinceLastNotif >= 7;
    return daysSinceLastNotif >= 1;
}

// Odoslanie emailu
async function sendExpirationEmail(license, daysUntilExpiry, levelConfig) {
    try {
        console.log(`Preparing email for license "${license.name}" (${daysUntilExpiry} days until expiry)`);
        const emailTransporter = await createTransporter();

        const mailOptions = {
            from: {
                name: NOTIFICATION_CONFIG.companyName,
                address: NOTIFICATION_CONFIG.emailFrom
            },
            to: levelConfig.emails,
            replyTo: NOTIFICATION_CONFIG.replyTo,
            subject: `${levelConfig.subject}: ${license.name}`,
            html: getEmailTemplate(license, daysUntilExpiry, levelConfig),
            priority: daysUntilExpiry <= 7 ? 'high' : 'normal'
        };

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

// HTML šablóna pre email
function getEmailTemplate(license, daysUntilExpiry, levelConfig) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { color: ${levelConfig.color}; }
                .details { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .warning { color: ${levelConfig.color}; font-weight: bold; }
                .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
                .bold { font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 class="header">Upozornenie na expiráciu licencie</h2>
                
                <p>Dobrý deň,</p>
                
                <p class="warning">
                    licencia <strong>${license.name}</strong> vyprší za ${daysUntilExpiry} dní
                    (${new Date(license.expiry_date).toLocaleDateString('sk-SK')}).
                </p>

                <div class="details">
                    <h3>Detaily licencie:</h3>
                    <ul>
                        <li><strong>Názov:</strong> ${license.name}</li>
                        <li><strong>Dátum vytvorenia:</strong> ${new Date(license.created_date).toLocaleDateString('sk-SK')}</li>
                        <li><strong>Dátum expirácie:</strong> ${new Date(license.expiry_date).toLocaleDateString('sk-SK')}</li>
                        <li><strong>Komentár:</strong> ${license.comment || 'Žiadny komentár'}</li>
                    </ul>
                </div>

                <p>Prosíme o zabezpečenie včasnej obnovy licencie.</p>

                <div class="footer">
                    <p>Toto je automatická notifikácia zo systému správy licencií ${NOTIFICATION_CONFIG.companyName}.</p>
                    <p>Pre ďalšie informácie kontaktujte: ${NOTIFICATION_CONFIG.replyTo}</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Logovanie notifikácií
async function logNotification(licenseId, daysWarning) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        const message = `Odoslaná ${daysWarning}-dňová notifikácia o expirácii`;
        
        db.run(
            'INSERT INTO license_logs (license_id, action, timestamp, changes) VALUES (?, ?, ?, ?)',
            [licenseId, 'notification', now, message],
            (err) => {
                if (err) {
                    console.error('Error logging notification:', err);
                    reject(err);
                } else {
                    console.log('Notification logged successfully');
                    resolve();
                }
            }
        );
    });
}

module.exports = {
    checkExpiringLicenses,
    verifyEmailConnection,
    EMAIL_CONFIG,
    NOTIFICATION_CONFIG
};
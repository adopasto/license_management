const { checkExpiringLicenses } = require('./src/email');

async function runNotifications() {
    console.log('Starting license notifications check...');
    try {
        await checkExpiringLicenses();
        console.log('License notifications completed');
    } catch (error) {
        console.error('Error during license notifications:', error);
    }
}

runNotifications();
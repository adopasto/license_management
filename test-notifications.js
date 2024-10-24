const { checkExpiringLicenses, verifyEmailConnection } = require('./src/email');

async function runNotificationTest() {
    console.log('Starting notification test...');
    
    try {
        // Najprv overíme pripojenie
        const isConnected = await verifyEmailConnection();
        if (!isConnected) {
            console.error('Failed to verify email connection');
            process.exit(1);
        }

        console.log('Email connection verified, checking licenses...');
        
        // Spustíme kontrolu licencií
        await checkExpiringLicenses();
        
        console.log('License check completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during notification test:', error);
        process.exit(1);
    }
}

runNotificationTest();
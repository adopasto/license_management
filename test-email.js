const { verifyEmailConnection } = require('./src/email');

console.log('Starting email test...');

verifyEmailConnection()
    .then(result => {
        console.log('Email test result:', result);
        process.exit(0);
    })
    .catch(error => {
        console.error('Email test failed:', error);
        process.exit(1);
    });
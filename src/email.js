const nodemailer = require('nodemailer');
const db = require('./db');

const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@example.com',
    pass: 'your-password'
  }
});

function checkExpiringLicenses() {
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  db.all('SELECT * FROM licenses WHERE expiry_date <= ?', [thirtyDaysFromNow.toISOString()], (err, licenses) => {
    if (err) {
      console.error('Error checking expiring licenses:', err);
      return;
    }
    
    licenses.forEach(license => {
      sendExpirationEmail(license);
    });
  });
}

function sendExpirationEmail(license) {
  const mailOptions = {
    from: 'your-email@example.com',
    to: 'admin@example.com',
    subject: `License Expiration: ${license.name}`,
    text: `The license "${license.name}" will expire on ${license.expiry_date}. Please take action.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

module.exports = { checkExpiringLicenses };
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const db = require('./db');

passport.use(new LocalStrategy((username, password, done) => {
    console.log('Attempting authentication...');
    console.log('Username:', username);
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Database error during authentication:', err);
            return done(err);
        }

        console.log('Database response:', user);
        
        if (!user) {
            console.log('User not found');
            return done(null, false, { message: 'Incorrect username.' });
        }

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return done(err);
            }

            console.log('Password match result:', isMatch);

            if (isMatch) {
                console.log('Authentication successful');
                return done(null, user);
            } else {
                console.log('Invalid password');
                return done(null, false, { message: 'Incorrect password.' });
            }
        });
    });
}));

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user);
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    console.log('Deserializing user:', id);
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('Error during deserialization:', err);
            return done(err);
        }
        console.log('Deserialized user:', user);
        done(null, user);
    });
});

module.exports = passport;
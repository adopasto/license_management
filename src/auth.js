const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const db = require('./db');

passport.use(new LocalStrategy((username, password, done) => {
    console.log('Attempting authentication...');
    console.log('Username:', username);
    console.log('Password provided:', !!password); // len pre debug - neukazuje skutočné heslo

    const sql = 'SELECT * FROM users WHERE username = ?';
    console.log('SQL query:', sql);
    
    db.get(sql, [username], async (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return done(err);
        }

        console.log('Database response:', user);

        if (!user) {
            console.log('No user found with this username');
            return done(null, false, { message: 'Incorrect username.' });
        }

        try {
            console.log('Comparing passwords...');
            const match = await bcrypt.compare(password, user.password);
            console.log('Password match:', match);

            if (match) {
                console.log('Authentication successful');
                return done(null, user);
            } else {
                console.log('Password did not match');
                return done(null, false, { message: 'Incorrect password.' });
            }
        } catch (err) {
            console.error('Error comparing passwords:', err);
            return done(err);
        }
    });
}));

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    console.log('Deserializing user:', id);
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('Deserialization error:', err);
            return done(err);
        }
        console.log('Deserialized user:', user ? user.id : 'none');
        done(null, user);
    });
});

module.exports = passport;
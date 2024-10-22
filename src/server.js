const express = require('express');
const session = require('express-session');
const passport = require('./auth');
const db = require('./db');
const { checkExpiringLicenses } = require('./email');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const port = 3000;

// Konfigurácia multer pre nahrávanie súborov
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // uistite sa, že tento priečinok existuje
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)) // unikátny názov súboru
    }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static('uploads'));
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// Login route
app.post('/login', (req, res, next) => {
    console.log('Login attempt for user:', req.body.username);
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return next(err);
        }
        if (!user) {
            console.log('Authentication failed for user:', req.body.username);
            return res.status(401).json({ message: 'Authentication failed' });
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return next(err);
            }
            console.log('Login successful for user:', user.username);
            return res.json({ message: 'Login successful' });
        });
    })(req, res, next);
});

app.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// CRUD operácie pre licencie
app.get('/api/licenses', (req, res) => {
  db.all('SELECT * FROM licenses', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/licenses', upload.single('attachment'), (req, res) => {
    const { name, created_date, expiry_date, comment } = req.body;
    const attachment_path = req.file ? req.file.path : null;

    db.run('INSERT INTO licenses (name, created_date, expiry_date, attachment_path, comment) VALUES (?, ?, ?, ?, ?)',
        [name, created_date, expiry_date, attachment_path, comment],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Pridanie logu
            const changeLog = `Created new license "${name}"`;
            db.run('INSERT INTO license_logs (license_id, user_id, action, timestamp, changes) VALUES (?, ?, ?, ?, ?)',
                [this.lastID, req.user ? req.user.id : null, 'create', new Date().toISOString(), changeLog],
                (logErr) => {
                    if (logErr) {
                        console.error('Error logging license creation:', logErr);
                    }
                }
            );
            
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/licenses/:id', upload.single('attachment'), (req, res) => {
    const id = req.params.id;
    const { name, expiry_date, comment } = req.body;
    const attachment_path = req.file ? req.file.path : req.body.existing_attachment_path;

    // Najprv získame pôvodné dáta licencie
    db.get('SELECT * FROM licenses WHERE id = ?', [id], (err, oldLicense) => {
        if (err) {
            console.error('Error fetching original license:', err);
            return res.status(500).json({ error: err.message });
        }

        // Vytvoríme pole zmien
        const changes = [];
        if (name !== oldLicense.name) {
            changes.push(`name changed from "${oldLicense.name}" to "${name}"`);
        }
        if (expiry_date !== oldLicense.expiry_date) {
            changes.push(`expiry date changed from "${oldLicense.expiry_date}" to "${expiry_date}"`);
        }
        if (comment !== oldLicense.comment) {
            changes.push(`comment changed from "${oldLicense.comment || 'empty'}" to "${comment || 'empty'}"`);
        }
        if (attachment_path !== oldLicense.attachment_path) {
            changes.push('attachment was updated');
        }

        // Aktualizujeme licenciu
        db.run('UPDATE licenses SET name = ?, expiry_date = ?, attachment_path = ?, comment = ? WHERE id = ?',
            [name, expiry_date, attachment_path, comment, id],
            function(err) {
                if (err) {
                    console.error('Error updating license:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                // Pridanie logu o úprave s detailami zmien
                const changeLog = changes.join('; ');
                db.run('INSERT INTO license_logs (license_id, user_id, action, timestamp, changes) VALUES (?, ?, ?, ?, ?)',
                    [id, req.user ? req.user.id : null, 'update', new Date().toISOString(), changeLog],
                    (logErr) => {
                        if (logErr) {
                            console.error('Error logging license update:', logErr);
                        }
                    }
                );
                
                res.json({ message: 'License updated', changes: changes });
            }
        );
    });
});

app.delete('/api/licenses/:id', (req, res) => {
  const id = req.params.id;
  
  // Získame informácie o licencii pred jej vymazaním
  db.get('SELECT name FROM licenses WHERE id = ?', [id], (err, license) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.run('DELETE FROM licenses WHERE id = ?', id, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Pridanie logu o zmazaní s názvom licencie
      const changeLog = `Deleted license "${license.name}"`;
      db.run('INSERT INTO license_logs (license_id, user_id, action, timestamp, changes) VALUES (?, ?, ?, ?, ?)',
        [id, req.user ? req.user.id : null, 'delete', new Date().toISOString(), changeLog],
        (logErr) => {
          if (logErr) {
            console.error('Error logging license deletion:', logErr);
          }
        }
      );
      
      res.json({ message: 'License deleted' });
    });
  });
});

app.get('/api/licenses/:id/logs', (req, res) => {
  const id = req.params.id;
  db.all(`
    SELECT license_logs.*, users.username 
    FROM license_logs 
    LEFT JOIN users ON license_logs.user_id = users.id 
    WHERE license_id = ?
    ORDER BY timestamp DESC
  `, id, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/licenses/:id/download', (req, res) => {
    const id = req.params.id;
    db.get('SELECT attachment_path FROM licenses WHERE id = ?', [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (row && row.attachment_path) {
            res.download(row.attachment_path);
        } else {
            res.status(404).json({ message: 'Attachment not found' });
        }
    });
});

// Spustenie servera
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Kontrola expirácie licencií každých 24 hodín
setInterval(checkExpiringLicenses, 24 * 60 * 60 * 1000);
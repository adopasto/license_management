const express = require('express');
const session = require('express-session');
const passport = require('./auth');
const db = require('./db');
const { checkExpiringLicenses, verifyEmailConnection } = require('./email');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const schedule = require('node-schedule');

const app = express();
const port = 3000;

// Konfigurácia multer pre nahrávanie súborov
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        // Vytvorenie uploads priečinka ak neexistuje
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static('uploads'));

// Session nastavenia
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // nastavte na true ak používate HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hodín
    }
}));

// Passport inicializácia
app.use(passport.initialize());
app.use(passport.session());

// Nastavenie automatických kontrol licencií
async function setupAutomaticChecks() {
    console.log('Setting up automatic license checks...');

    // Každodenná kontrola o 8:00
    const dailyJob = schedule.scheduleJob('0 8 * * *', async () => {
        console.log('Running daily license check:', new Date().toISOString());
        try {
            await checkExpiringLicenses();
            console.log('Daily check completed successfully');
        } catch (error) {
            console.error('Error in daily check:', error);
        }
    });

    // Pre vývoj/testovanie - kontrola každú minútu
    // Odkomentujte pre testovanie
    /*
    const testJob = schedule.scheduleJob('* * * * *', async () => {
        console.log('Running test license check:', new Date().toISOString());
        try {
            await checkExpiringLicenses();
            console.log('Test check completed');
        } catch (error) {
            console.error('Error in test check:', error);
        }
    });
    */

    console.log('Automatic checks configured successfully');
}

// Middleware pre kontrolu autentifikácie
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
}

// Login route
app.post('/login', (req, res, next) => {
    console.log('Login request received');
    
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ 
            message: 'Missing credentials',
            details: 'Both username and password are required' 
        });
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return res.status(500).json({ 
                message: 'Authentication error',
                details: err.message 
            });
        }

        if (!user) {
            console.log('Authentication failed - invalid credentials');
            return res.status(401).json({ 
                message: 'Authentication failed',
                details: info ? info.message : 'Invalid credentials'
            });
        }

        req.login(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return res.status(500).json({ 
                    message: 'Login error',
                    details: err.message 
                });
            }

            console.log('Login successful for user:', user.username);
            return res.json({ 
                message: 'Login successful',
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        });
    })(req, res, next);
});

// Logout route
app.post('/logout', (req, res) => {
    const username = req.user?.username;
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ 
                message: 'Error logging out',
                details: err.message 
            });
        }
        console.log(`User ${username} logged out successfully`);
        res.json({ message: 'Logout successful' });
    });
});

// CRUD operácie pre licencie
app.get('/api/licenses', isAuthenticated, (req, res) => {
    db.all('SELECT * FROM licenses ORDER BY expiry_date ASC', (err, rows) => {
        if (err) {
            console.error('Error fetching licenses:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/licenses', isAuthenticated, upload.single('attachment'), (req, res) => {
    const { name, created_date, expiry_date, comment } = req.body;
    const attachment_path = req.file ? req.file.path : null;

    db.run('INSERT INTO licenses (name, created_date, expiry_date, attachment_path, comment) VALUES (?, ?, ?, ?, ?)',
        [name, created_date, expiry_date, attachment_path, comment],
        function(err) {
            if (err) {
                console.error('Error creating license:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            
            const changeLog = `Created new license "${name}"`;
            db.addLog(this.lastID, req.user.id, 'create', changeLog, (logErr) => {
                if (logErr) {
                    console.error('Error logging license creation:', logErr);
                }
            });
            
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/licenses/:id', isAuthenticated, upload.single('attachment'), (req, res) => {
    const id = req.params.id;
    const { name, expiry_date, comment } = req.body;
    const attachment_path = req.file ? req.file.path : req.body.existing_attachment_path;

    db.get('SELECT * FROM licenses WHERE id = ?', [id], (err, oldLicense) => {
        if (err) {
            console.error('Error fetching license for update:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!oldLicense) {
            return res.status(404).json({ message: 'License not found' });
        }

        const changes = [];
        if (name !== oldLicense.name) changes.push(`name changed from "${oldLicense.name}" to "${name}"`);
        if (expiry_date !== oldLicense.expiry_date) changes.push(`expiry date changed from "${oldLicense.expiry_date}" to "${expiry_date}"`);
        if (comment !== oldLicense.comment) changes.push(`comment changed from "${oldLicense.comment || 'empty'}" to "${comment || 'empty'}"`);
        if (attachment_path !== oldLicense.attachment_path) changes.push('attachment was updated');

        db.run('UPDATE licenses SET name = ?, expiry_date = ?, attachment_path = ?, comment = ? WHERE id = ?',
            [name, expiry_date, attachment_path, comment, id],
            function(err) {
                if (err) {
                    console.error('Error updating license:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                if (changes.length > 0) {
                    const changeLog = changes.join('; ');
                    db.addLog(id, req.user.id, 'update', changeLog, (logErr) => {
                        if (logErr) {
                            console.error('Error logging license update:', logErr);
                        }
                    });
                }
                
                res.json({ message: 'License updated', changes: changes });
            }
        );
    });
});

app.delete('/api/licenses/:id', isAuthenticated, (req, res) => {
    const id = req.params.id;
    
    db.get('SELECT * FROM licenses WHERE id = ?', [id], (err, license) => {
        if (err) {
            console.error('Error fetching license for deletion:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (!license) {
            return res.status(404).json({ message: 'License not found' });
        }

        const deletedDate = new Date().toISOString();
        db.run(
            'INSERT INTO deleted_licenses (original_id, name, created_date, expiry_date, deleted_date, deleted_by, comment, attachment_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [license.id, license.name, license.created_date, license.expiry_date, deletedDate, req.user.id, license.comment, license.attachment_path],
            (err) => {
                if (err) {
                    console.error('Error archiving deleted license:', err);
                    return res.status(500).json({ error: err.message });
                }

                db.run('DELETE FROM licenses WHERE id = ?', [id], function(err) {
                    if (err) {
                        console.error('Error deleting license:', err);
                        return res.status(500).json({ error: err.message });
                    }

                    const changeLog = `Deleted license "${license.name}"`;
                    db.addLog(id, req.user.id, 'delete', changeLog, (logErr) => {
                        if (logErr) {
                            console.error('Error logging license deletion:', logErr);
                        }
                    });

                    res.json({ 
                        message: 'License deleted and archived',
                        deletedLicenseId: this.lastID 
                    });
                });
            }
        );
    });
});

app.get('/api/licenses/:id/logs', isAuthenticated, (req, res) => {
    const id = req.params.id;
    db.all(`
        SELECT license_logs.*, users.username 
        FROM license_logs 
        LEFT JOIN users ON license_logs.user_id = users.id 
        WHERE license_id = ?
        ORDER BY timestamp DESC
    `, [id], (err, rows) => {
        if (err) {
            console.error('Error fetching license logs:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/licenses/:id/download', isAuthenticated, (req, res) => {
    const id = req.params.id;
    db.get('SELECT attachment_path FROM licenses WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Error fetching attachment path:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        if (row && row.attachment_path) {
            res.download(row.attachment_path, (err) => {
                if (err) {
                    console.error('Error downloading file:', err);
                    res.status(500).json({ error: 'File download failed' });
                }
            });
        } else {
            res.status(404).json({ message: 'Attachment not found' });
        }
    });
});

app.get('/api/deleted-licenses', isAuthenticated, (req, res) => {
    db.all(`
        SELECT dl.*, u.username as deleted_by_username
        FROM deleted_licenses dl
        LEFT JOIN users u ON dl.deleted_by = u.id
        ORDER BY dl.deleted_date DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('Error fetching deleted licenses:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        message: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Spustenie servera
app.listen(port, async () => {
    console.log(`Server is running on http://localhost:${port}`);
    
    // Vytvorenie uploads priečinka ak neexistuje
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)){
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('Created uploads directory');
    }

    // Kontrola emailového pripojenia a nastavenie automatických kontrol
    try {
        if (await verifyEmailConnection()) {
            console.log('Email connection verified, setting up automatic checks');
            await setupAutomaticChecks();
            
            // Prvá kontrola pri štarte
            await checkExpiringLicenses();
        } else {
            console.log('Email connection failed, automatic checks will not be enabled');
        }
    } catch (error) {
        console.error('Error setting up email notifications:', error);
    }
});
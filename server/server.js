const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

// Initialize SQLite database
const db = new sqlite3.Database('./gambling.db');

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        balance REAL DEFAULT 0,
        role TEXT DEFAULT 'user'
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        type TEXT,
        amount REAL,
        game TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Auth routes
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword],
        (err) => {
            if (err) return res.status(400).json({ error: 'Username taken' });
            res.status(201).json({ message: 'User created successfully' });
        }
    );
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'User not found' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });
        
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'your-secret-key');
        res.json({ token, role: user.role });
    });
});

// Protected routes
app.get('/api/balance', authenticateToken, (req, res) => {
    db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ balance: row.balance });
    });
});

app.post('/api/transaction', authenticateToken, (req, res) => {
    const { type, amount, game } = req.body;
    db.run('INSERT INTO transactions (userId, type, amount, game) VALUES (?, ?, ?, ?)',
        [req.user.id, type, amount, game],
        (err) => {
            if (err) return res.status(500).json({ error: 'Transaction failed' });
            
            db.run('UPDATE users SET balance = balance + ? WHERE id = ?',
                [type === 'win' ? amount : -amount, req.user.id],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Balance update failed' });
                    res.json({ message: 'Transaction successful' });
                }
            );
        }
    );
});

// Admin routes
app.post('/api/admin/balance', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    const { userId, amount } = req.body;
    db.run('UPDATE users SET balance = balance + ? WHERE id = ?',
        [amount, userId],
        (err) => {
            if (err) return res.status(500).json({ error: 'Balance adjustment failed' });
            res.json({ message: 'Balance adjusted successfully' });
        }
    );
});

// Game WebSocket logic
io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join-game', (gameId) => {
        // Leave previous room if any
        if (currentRoom) {
            socket.leave(currentRoom);
        }
        socket.join(gameId);
        currentRoom = gameId;
        
        // If joining aviator, start sending crash points
        if (gameId === 'aviator') {
            // Generate and send crash point every 10 seconds
            const aviatorInterval = setInterval(() => {
                const crashPoint = generateCrashPoint();
                io.to('aviator').emit('game-crash', { crashPoint });
            }, 10000);
            
            socket.on('disconnect', () => {
                clearInterval(aviatorInterval);
            });
        }
    });
    
    socket.on('place-bet', (data) => {
        if (!currentRoom) return;
        
        // Get user info from token
        const token = socket.handshake.auth.token;
        let username = 'Anonymous';
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            username = decoded.username;
        } catch (err) {
            console.error('Invalid token in socket connection');
        }
        
        // Broadcast bet to room
        io.to(currentRoom).emit('bet-placed', {
            username,
            amount: data.amount,
            game: data.game
        });
    });
});

// Helper function to generate realistic crash points
function generateCrashPoint() {
    const random = Math.random();
    
    if (random < 0.40) {
        return 1.00 + Math.random() * 1.2; // 40% chance of early crash (1.0-2.2x)
    } else if (random < 0.75) {
        return 2.2 + Math.random() * 1.8; // 35% chance of medium crash (2.2-4.0x)
    } else if (random < 0.95) {
        return 4.0 + Math.random() * 0.8; // 20% chance of high crash (4.0-4.8x)
    } else {
        return 4.8 + Math.random() * 0.2; // 5% chance of very high (4.8-5.0x)
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

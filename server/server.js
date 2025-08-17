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
const db = new sqlite3.Database(path.join(__dirname, '../gambling.db'));

// Database initialization function
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                balance REAL DEFAULT 0,
                role TEXT DEFAULT 'user',
                account_status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                total_deposits REAL DEFAULT 0,
                total_withdrawals REAL DEFAULT 0
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                type TEXT,
                amount REAL,
                game TEXT,
                game_session_id TEXT,
                bet_details TEXT,
                bet_multiplier REAL,
                transaction_status TEXT DEFAULT 'completed',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(userId) REFERENCES users(id)
            )`);
            
            // New round-based system tables
            db.run(`CREATE TABLE IF NOT EXISTS game_rounds (
                id TEXT PRIMARY KEY,
                game_type TEXT NOT NULL,
                round_number INTEGER NOT NULL,
                status TEXT DEFAULT 'betting',
                crash_point REAL,
                server_seed TEXT,
                client_seed TEXT,
                house_edge REAL,
                betting_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                betting_end_time DATETIME,
                flight_start_time DATETIME,
                flight_end_time DATETIME,
                total_bets INTEGER DEFAULT 0,
                total_wagered REAL DEFAULT 0,
                total_payouts REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS round_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                round_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                bet_amount REAL NOT NULL,
                cashout_multiplier REAL,
                cashout_time DATETIME,
                payout REAL DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(round_id) REFERENCES game_rounds(id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(round_id, user_id)
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS round_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                round_id TEXT NOT NULL,
                transaction_id INTEGER NOT NULL,
                transaction_type TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(round_id) REFERENCES game_rounds(id),
                FOREIGN KEY(transaction_id) REFERENCES transactions(id)
            )`);
            
            // System settings table for game configuration
            db.run(`CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Game sessions table for admin dashboard
            db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                game_type TEXT NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                total_bets INTEGER DEFAULT 0,
                total_wagered REAL DEFAULT 0,
                total_winnings REAL DEFAULT 0,
                session_status TEXT DEFAULT 'active',
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
            
            // Admin actions table for audit trail
            db.run(`CREATE TABLE IF NOT EXISTS admin_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_user_id INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                target_user_id INTEGER,
                action_details TEXT,
                old_value TEXT,
                new_value TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(admin_user_id) REFERENCES users(id),
                FOREIGN KEY(target_user_id) REFERENCES users(id)
            )`);

            // Deposit/Withdrawal requests table for EasyPaisa payment system
            db.run(`CREATE TABLE IF NOT EXISTS deposit_withdrawal_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                request_type TEXT NOT NULL CHECK(request_type IN ('deposit', 'withdrawal')),
                amount REAL NOT NULL,
                user_easypaisa_number TEXT NOT NULL,
                user_easypaisa_name TEXT NOT NULL,
                admin_easypaisa_number TEXT,
                admin_easypaisa_name TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
                admin_notes TEXT,
                processed_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(processed_by) REFERENCES users(id)
            )`);

            // Insert default settings
            db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value, category, description) VALUES
                ('house_edge_aviator', '3.0', 'game_settings', 'House edge percentage for Aviator game'),
                ('house_edge_dice', '2.5', 'game_settings', 'House edge percentage for Dice game'),
                ('house_edge_coinflip', '2.0', 'game_settings', 'House edge percentage for Coinflip game'),
                ('house_edge_color_trading', '3.5', 'game_settings', 'House edge percentage for Color Trading game'),
                ('min_bet_amount', '10', 'betting_limits', 'Minimum bet amount allowed'),
                ('max_bet_amount', '1000', 'betting_limits', 'Maximum bet amount allowed'),
                ('max_daily_loss', '5000', 'betting_limits', 'Maximum daily loss limit per user'),
                ('easypaisa_account_number', '03001234567', 'payment_settings', 'Admin EasyPaisa account number'),
                ('easypaisa_account_name', 'Jeeto92 Gaming', 'payment_settings', 'Admin EasyPaisa account name'),
                ('min_deposit_amount', '100', 'payment_settings', 'Minimum deposit amount allowed'),
                ('max_deposit_amount', '50000', 'payment_settings', 'Maximum deposit amount allowed'),
                ('min_withdrawal_amount', '200', 'payment_settings', 'Minimum withdrawal amount allowed'),
                ('max_withdrawal_amount', '25000', 'payment_settings', 'Maximum withdrawal amount allowed'),
                ('daily_deposit_limit', '100000', 'payment_settings', 'Daily deposit limit per user'),
                ('daily_withdrawal_limit', '50000', 'payment_settings', 'Daily withdrawal limit per user')
            `, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// Enhanced Admin Authentication Middleware
const authenticateAdmin = (req, res, next) => {
    
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Admin access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', async (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired admin token' });
        }
        
        
        // Verify user is still admin in database (in case role changed)
        try {
            const dbUser = await new Promise((resolve, reject) => {
                db.get('SELECT id, username, role FROM users WHERE id = ? AND role = ?', 
                    [user.id, 'admin'], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
            });
            
            if (!dbUser) {
                return res.status(403).json({ error: 'Admin privileges required' });
            }
            
            req.user = user;
            req.adminUser = dbUser;
            next();
        } catch (error) {
            console.error('🚨 Admin auth database error:', error);
            res.status(500).json({ error: 'Authentication verification failed' });
        }
    });
};

// Role-based Access Control Middleware
const requireRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ 
                error: `Access denied. ${role} role required.`,
                userRole: req.user.role 
            });
        }
        next();
    };
};

// Super Admin Check (for critical operations)
const requireSuperAdmin = async (req, res, next) => {
    try {
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT username FROM users WHERE id = ? AND username = ?', 
                [req.user.id, 'admin'], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
        });
        
        if (!user || user.username !== 'admin') {
            return res.status(403).json({ error: 'Super admin privileges required' });
        }
        
        next();
    } catch (error) {
        res.status(500).json({ error: 'Super admin verification failed' });
    }
};

// Validation middleware for gaming transactions
const validateGameTransaction = async (req, res, next) => {
    const { type, amount, game } = req.body;
    
    // Basic validation
    if (!type || !amount || !game) {
        return res.status(400).json({ error: 'Missing required fields: type, amount, game' });
    }
    
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
        return res.status(400).json({ error: 'Amount must be a positive finite number' });
    }
    
    // Additional safety check for extreme values
    if (amount > 1000000) {
        return res.status(400).json({ error: 'Amount exceeds maximum allowed value' });
    }
    
    try {
        // Get system settings for validation
        const settings = await getSystemSettings();
        
        // Validate bet amount against system limits
        if (amount < settings.min_bet_amount) {
            return res.status(400).json({ error: `Minimum bet amount is ${settings.min_bet_amount}` });
        }
        
        if (amount > settings.max_bet_amount) {
            return res.status(400).json({ error: `Maximum bet amount is ${settings.max_bet_amount}` });
        }
        
        // Get user balance for validation
        const userBalance = await getUserBalance(req.user.id);
        
        // For bet/loss transactions, check if user has sufficient balance
        if (type === 'bet' || type === 'loss') {
            if (userBalance < amount) {
                return res.status(400).json({ error: 'Insufficient balance' });
            }
        }
        
        // Validate game type
        const validGames = ['aviator', 'crash', 'dice', 'coinflip', 'color-trading'];
        if (!validGames.includes(game)) {
            return res.status(400).json({ error: 'Invalid game type' });
        }
        
        // Check daily loss limit
        const dailyLoss = await getDailyLoss(req.user.id);
        if (type === 'bet' || type === 'loss') {
            if (dailyLoss + amount > settings.max_daily_loss) {
                return res.status(400).json({ error: 'Daily loss limit exceeded' });
            }
        }
        
        req.validatedTransaction = { type, amount, game, userBalance };
        next();
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
};

// Helper functions for validation
async function getSystemSettings() {
    return new Promise((resolve, reject) => {
        db.all('SELECT setting_key, setting_value FROM system_settings', (err, rows) => {
            if (err) return reject(err);
            
            const settings = {};
            rows.forEach(row => {
                const value = isNaN(row.setting_value) ? row.setting_value : parseFloat(row.setting_value);
                settings[row.setting_key] = value;
            });
            resolve(settings);
        });
    });
}

async function getUserBalance(userId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, row) => {
            if (err) return reject(err);
            resolve(row ? (row.balance || 0) : 0);
        });
    });
}

async function getDailyLoss(userId) {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().split('T')[0];
        db.get(
            `SELECT SUM(amount) as daily_loss FROM transactions 
             WHERE userId = ? AND (type = 'bet' OR type = 'loss') 
             AND DATE(timestamp) = ?`,
            [userId, today],
            (err, row) => {
                if (err) return reject(err);
                resolve(row ? (row.daily_loss || 0) : 0);
            }
        );
    });
}

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
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'your-secret-key');
        res.json({ token, role: user.role });
    });
});

// Protected routes
app.get('/api/balance', authenticateToken, (req, res) => {
    db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'User not found' });
        res.json({ balance: row.balance || 0 });
    });
});

app.post('/api/transaction', authenticateToken, validateGameTransaction, async (req, res) => {
    const { type, amount, game, gameSessionId, betDetails, betMultiplier } = req.body;
    const { userBalance } = req.validatedTransaction;
    
    try {
        // Enhanced transaction processing with detailed recording
        const transactionId = await processEnhancedTransaction({
            userId: req.user.id,
            type,
            amount,
            game,
            gameSessionId,
            betDetails,
            betMultiplier,
            userBalance
        });
        
        res.json({ 
            message: 'Transaction successful',
            transactionId,
            newBalance: await getUserBalance(req.user.id)
        });
    } catch (error) {
        console.error('Transaction processing error:', error);
        res.status(500).json({ error: 'Transaction processing failed' });
    }
});

// Enhanced transaction processing service
async function processEnhancedTransaction(transactionData) {
    const {
        userId,
        type,
        amount,
        game,
        gameSessionId,
        betDetails,
        betMultiplier,
        userBalance
    } = transactionData;
    
    return new Promise((resolve, reject) => {
        // Use a more robust transaction approach to prevent nested transactions
        const executeTransaction = () => {
            // Insert transaction with enhanced details
            db.run(
                `INSERT INTO transactions 
                 (userId, type, amount, game, game_session_id, bet_details, bet_multiplier, transaction_status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, type, amount, game, gameSessionId, JSON.stringify(betDetails), betMultiplier, 'completed'],
                function(err) {
                    if (err) return reject(err);
                    
                    const transactionId = this.lastID;
                    
                    // Update user balance with safeguard against negative balance
                    const balanceChange = type === 'win' ? amount : -amount;
                    
                    // For loss/bet transactions, ensure we don't create negative balance
                    let updateQuery, updateParams;
                    if (type === 'win') {
                        updateQuery = 'UPDATE users SET balance = balance + ? WHERE id = ?';
                        updateParams = [balanceChange, userId];
                    } else {
                        // Ensure balance doesn't go below 0
                        updateQuery = 'UPDATE users SET balance = MAX(0, balance + ?) WHERE id = ?';
                        updateParams = [balanceChange, userId];
                    }
                    
                    db.run(updateQuery, updateParams, (err) => {
                        if (err) return reject(err);
                        
                        // Update deposit/withdrawal totals
                        if (type === 'deposit') {
                            db.run('UPDATE users SET total_deposits = total_deposits + ? WHERE id = ?',
                                [amount, userId], (err) => {
                                    if (err) return reject(err);
                                    resolve(transactionId);
                                });
                        } else if (type === 'withdrawal') {
                            db.run('UPDATE users SET total_withdrawals = total_withdrawals + ? WHERE id = ?',
                                [amount, userId], (err) => {
                                    if (err) return reject(err);
                                    resolve(transactionId);
                                });
                        } else {
                            resolve(transactionId);
                        }
                    });
                }
            );
        };
        
        // Execute transaction with automatic retry on busy database
        const tryExecute = (attempt = 1) => {
            try {
                executeTransaction();
            } catch (error) {
                if (error.code === 'SQLITE_BUSY' && attempt < 3) {
                    setTimeout(() => tryExecute(attempt + 1), 100 * attempt);
                } else {
                    reject(error);
                }
            }
        };
        
        tryExecute();
    });
}

// Game result verification and processing endpoints
app.post('/api/game/verify-result', authenticateToken, async (req, res) => {
    const { game, betAmount, gameResult, clientSeed, serverSeed } = req.body;
    
    try {
        // Generate server-side result for verification
        const serverResult = await generateGameResult(game, serverSeed, clientSeed);
        
        // Verify client result matches server calculation
        const isValid = verifyGameResult(game, gameResult, serverResult);
        
        if (!isValid) {
            return res.status(400).json({ 
                error: 'Game result verification failed',
                serverResult: serverResult
            });
        }
        
        // Calculate payout based on verified result
        const payout = await calculatePayout(game, betAmount, gameResult);
        
        res.json({
            verified: true,
            serverResult,
            payout,
            isWin: payout > betAmount
        });
    } catch (error) {
        console.error('Game verification error:', error);
        res.status(500).json({ error: 'Game verification failed' });
    }
});

app.post('/api/game/play', authenticateToken, async (req, res) => {
    const { game, amount, gameParams } = req.body;
    
    // Validate input manually for this endpoint
    if (!game || !amount) {
        return res.status(400).json({ error: 'Missing required fields: game, amount' });
    }
    
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
        return res.status(400).json({ error: 'Amount must be a positive finite number' });
    }
    
    if (amount > 1000000) {
        return res.status(400).json({ error: 'Amount exceeds maximum allowed value' });
    }
    
    // Get user balance for validation
    const userBalance = await getUserBalance(req.user.id);
    if (userBalance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    try {
        // Generate server seeds and game result
        const serverSeed = generateServerSeed();
        const clientSeed = req.body.clientSeed || generateClientSeed();
        
        // Start game session
        const sessionId = await startGameSession(req.user.id, game);
        
        // Generate game result server-side
        const gameResult = await generateGameResult(game, serverSeed, clientSeed, gameParams);
        
        // Calculate payout
        const payout = await calculatePayout(game, amount, gameResult);
        const isWin = payout > 0;
        
        // Process transaction
        const transactionData = {
            userId: req.user.id,
            type: isWin ? 'win' : 'loss',
            amount: isWin ? payout : amount,
            game,
            gameSessionId: sessionId,
            betDetails: {
                serverSeed,
                clientSeed,
                gameResult,
                originalBet: amount,
                payout
            },
            betMultiplier: isWin ? (payout / amount) : 0
        };
        
        const transactionId = await processEnhancedTransaction(transactionData);
        
        // Update game session
        await updateGameSession(sessionId, {
            total_bets: 1,
            total_wagered: amount,
            total_winnings: isWin ? payout : 0,
            session_status: 'completed'
        });
        
        res.json({
            success: true,
            sessionId,
            transactionId,
            gameResult,
            payout,
            isWin,
            newBalance: await getUserBalance(req.user.id),
            seeds: { serverSeed, clientSeed }
        });
    } catch (error) {
        console.error('Game play error:', error);
        res.status(500).json({ error: 'Game processing failed' });
    }
});

// Game session management functions
async function startGameSession(userId, gameType) {
    const sessionId = generateSessionId();
    
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO game_sessions (id, user_id, game_type) VALUES (?, ?, ?)',
            [sessionId, userId, gameType],
            (err) => {
                if (err) return reject(err);
                resolve(sessionId);
            }
        );
    });
}

async function updateGameSession(sessionId, updates) {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE game_sessions SET ${setClause}, end_time = CURRENT_TIMESTAMP WHERE id = ?`,
            [...values, sessionId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

// Audit trail functions
async function logAdminAction(adminUserId, actionType, targetUserId, actionDetails, oldValue, newValue) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO admin_actions 
             (admin_user_id, action_type, target_user_id, action_details, old_value, new_value) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [adminUserId, actionType, targetUserId, JSON.stringify(actionDetails), oldValue, newValue],
            function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

// ============================================================================
// ROUND-BASED GAME MANAGEMENT SYSTEM
// ============================================================================

// Round management state
let currentAviatorRound = null;
let roundStartTimeout = null;
let roundBettingTimeout = null;

// Round status enum
const ROUND_STATUS = {
    BETTING: 'betting',
    FLYING: 'flying', 
    ENDED: 'ended',
    SETTLING: 'settling'
};

// Generate unique round ID
function generateRoundId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create new game round
async function createNewRound(gameType = 'aviator') {
    const roundId = generateRoundId();
    const serverSeed = generateServerSeed();
    const clientSeed = generateClientSeed();
    const houseEdge = await getHouseEdge(gameType);
    
    // Generate crash point for this round
    const gameResult = await generateGameResult(gameType, serverSeed, clientSeed, {});
    
    // Get next round number
    const lastRound = await new Promise((resolve, reject) => {
        db.get(
            'SELECT round_number FROM game_rounds WHERE game_type = ? ORDER BY round_number DESC LIMIT 1',
            [gameType],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
    
    const roundNumber = (lastRound?.round_number || 0) + 1;
    
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO game_rounds (
                id, game_type, round_number, status, crash_point, 
                server_seed, client_seed, house_edge, betting_start_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [roundId, gameType, roundNumber, ROUND_STATUS.BETTING, gameResult.crashPoint, serverSeed, clientSeed, houseEdge],
        function(err) {
            if (err) return reject(err);
            
            const round = {
                id: roundId,
                gameType,
                roundNumber,
                status: ROUND_STATUS.BETTING,
                crashPoint: gameResult.crashPoint,
                serverSeed,
                clientSeed,
                houseEdge,
                participants: new Map(),
                totalBets: 0,
                totalWagered: 0
            };
            
            resolve(round);
        });
    });
}

// Add participant to round
async function addParticipantToRound(roundId, userId, betAmount) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO round_participants (round_id, user_id, bet_amount)
            VALUES (?, ?, ?)
        `, [roundId, userId, betAmount],
        function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
}

// Process cashout for participant
async function processCashout(roundId, userId, cashoutMultiplier) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Get participant data
            db.get(`
                SELECT * FROM round_participants 
                WHERE round_id = ? AND user_id = ? AND status = 'active'
            `, [roundId, userId], (err, participant) => {
                if (err) return reject(err);
                if (!participant) return reject(new Error('Participant not found or already cashed out'));
                
                const payout = participant.bet_amount * cashoutMultiplier;
                
                // Update participant
                db.run(`
                    UPDATE round_participants 
                    SET cashout_multiplier = ?, cashout_time = CURRENT_TIMESTAMP, 
                        payout = ?, status = 'cashed_out'
                    WHERE round_id = ? AND user_id = ?
                `, [cashoutMultiplier, payout, roundId, userId], (err) => {
                    if (err) return reject(err);
                    resolve({ payout, cashoutMultiplier });
                });
            });
        });
    });
}

// Update round status
async function updateRoundStatus(roundId, status, additionalData = {}) {
    const setClause = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    
    Object.keys(additionalData).forEach(key => {
        setClause.push(`${key} = ?`);
        values.push(additionalData[key]);
    });
    
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE game_rounds SET ${setClause.join(', ')} WHERE id = ?`,
            [...values, roundId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

// Settle round and distribute payouts
async function settleRound(roundId) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Get all participants who didn't cash out
            db.all(`
                SELECT rp.*, u.username FROM round_participants rp
                JOIN users u ON rp.user_id = u.id
                WHERE rp.round_id = ? AND rp.status = 'active'
            `, [roundId], async (err, activePlayers) => {
                if (err) return reject(err);
                
                try {
                    // Process wins for cashed out players
                    const cashedOutPlayers = await new Promise((res, rej) => {
                        db.all(`
                            SELECT * FROM round_participants 
                            WHERE round_id = ? AND status = 'cashed_out'
                        `, [roundId], (err, rows) => {
                            if (err) rej(err);
                            else res(rows);
                        });
                    });
                    
                    // Credit winnings to cashed out players
                    for (const player of cashedOutPlayers) {
                        await processEnhancedTransaction({
                            userId: player.user_id,
                            type: 'win',
                            amount: player.payout,
                            game: 'aviator',
                            gameSessionId: roundId,
                            betDetails: {
                                roundId,
                                betAmount: player.bet_amount,
                                cashoutMultiplier: player.cashout_multiplier,
                                roundBased: true
                            },
                            betMultiplier: player.cashout_multiplier
                        });
                    }
                    
                    // Update round totals
                    await updateRoundStatus(roundId, ROUND_STATUS.ENDED, {
                        flight_end_time: 'CURRENT_TIMESTAMP',
                        total_bets: activePlayers.length + cashedOutPlayers.length,
                        total_wagered: activePlayers.reduce((sum, p) => sum + p.bet_amount, 0) + 
                                      cashedOutPlayers.reduce((sum, p) => sum + p.bet_amount, 0),
                        total_payouts: cashedOutPlayers.reduce((sum, p) => sum + p.payout, 0)
                    });
                    
                    resolve({
                        activePlayers: activePlayers.length,
                        cashedOut: cashedOutPlayers.length,
                        totalPayouts: cashedOutPlayers.reduce((sum, p) => sum + p.payout, 0)
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    });
}

// Start new round cycle
async function startNewRoundCycle() {
    try {
        console.log('🎯 Starting new Aviator round...');
        
        // Create new round
        currentAviatorRound = await createNewRound('aviator');
        
        console.log(`📊 Round ${currentAviatorRound.roundNumber} created (ID: ${currentAviatorRound.id})`);
        console.log(`🎲 Crash point: ${currentAviatorRound.crashPoint}x`);
        
        // Broadcast round start to all connected clients
        const aviatorClients = io.sockets.adapter.rooms.get('aviator');
        console.log(`📡 Broadcasting to ${aviatorClients ? aviatorClients.size : 0} aviator clients`);
        
        io.to('aviator').emit('round-started', {
            roundId: currentAviatorRound.id,
            roundNumber: currentAviatorRound.roundNumber,
            bettingTimeLeft: 10
        });
        
        // Set betting countdown (10 seconds)
        roundBettingTimeout = setTimeout(async () => {
            await startFlightPhase();
        }, 10000);
        
    } catch (error) {
        console.error('❌ Error starting new round:', error);
    }
}

// Start flight phase
async function startFlightPhase() {
    if (!currentAviatorRound) return;
    
    try {
        console.log(`✈️ Flight phase starting for round ${currentAviatorRound.roundNumber}`);
        
        // Update round status
        await updateRoundStatus(currentAviatorRound.id, ROUND_STATUS.FLYING, {
            betting_end_time: 'CURRENT_TIMESTAMP',
            flight_start_time: 'CURRENT_TIMESTAMP'
        });
        
        currentAviatorRound.status = ROUND_STATUS.FLYING;
        
        // Broadcast flight start
        io.to('aviator').emit('flight-started', {
            roundId: currentAviatorRound.id,
            crashPoint: currentAviatorRound.crashPoint
        });
        
        // Calculate flight duration based on crash point (roughly 1-10 seconds)
        const flightDuration = Math.min(Math.max(currentAviatorRound.crashPoint * 1000, 2000), 10000);
        
        // Set crash timeout
        roundStartTimeout = setTimeout(async () => {
            await endRound();
        }, flightDuration);
        
    } catch (error) {
        console.error('❌ Error starting flight phase:', error);
    }
}

// End current round
async function endRound() {
    if (!currentAviatorRound) return;
    
    try {
        console.log(`💥 Round ${currentAviatorRound.roundNumber} ending at ${currentAviatorRound.crashPoint}x`);
        
        // Update round status
        await updateRoundStatus(currentAviatorRound.id, ROUND_STATUS.SETTLING);
        
        // Broadcast round end
        io.to('aviator').emit('round-ended', {
            roundId: currentAviatorRound.id,
            crashPoint: currentAviatorRound.crashPoint
        });
        
        // Settle round and distribute payouts
        const settlementResult = await settleRound(currentAviatorRound.id);
        console.log(`💰 Settlement: ${settlementResult.cashedOut} winners, Rs.${settlementResult.totalPayouts} paid out`);
        
        // Clear current round
        currentAviatorRound = null;
        
        // Wait 2 seconds before starting new round
        setTimeout(() => {
            startNewRoundCycle();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error ending round:', error);
    }
}

// Initialize round system on server start
function initializeRoundSystem() {
    console.log('🚀 Initializing round-based game system...');
    
    // Start first round after 3 seconds
    setTimeout(() => {
        startNewRoundCycle();
    }, 3000);
}

// ============================================================================
// ADMIN API ROUTES
// ============================================================================

// Admin dashboard data helper
async function getAdminDashboardData() {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const stats = await new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'user') as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'user' AND DATE(created_at) = ?) as new_users_today,
                (SELECT COUNT(*) FROM transactions WHERE DATE(timestamp) = ?) as transactions_today,
                (SELECT COUNT(*) FROM transactions WHERE DATE(timestamp) >= ?) as transactions_week,
                (SELECT SUM(amount) FROM transactions WHERE type = 'win' AND DATE(timestamp) = ?) as winnings_today,
                (SELECT SUM(amount) FROM transactions WHERE type IN ('loss', 'bet') AND DATE(timestamp) = ?) as losses_today,
                (SELECT SUM(balance) FROM users WHERE role = 'user') as total_user_balance,
                (SELECT COUNT(*) FROM game_sessions WHERE session_status = 'active') as active_sessions
        `, [today, today, weekAgo, today, today], (err, rows) => {
            if (err) reject(err);
            else resolve(rows[0]);
        });
    });
    
    const gameStats = await new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                game,
                COUNT(*) as play_count,
                SUM(CASE WHEN type = 'win' THEN amount ELSE 0 END) as total_winnings,
                SUM(CASE WHEN type IN ('loss', 'bet') THEN amount ELSE 0 END) as total_losses
            FROM transactions 
            WHERE DATE(timestamp) >= ?
            GROUP BY game
        `, [weekAgo], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    
    const recentActions = await new Promise((resolve, reject) => {
        db.all(`
            SELECT aa.*, u1.username as admin_username, u2.username as target_username
            FROM admin_actions aa
            LEFT JOIN users u1 ON aa.admin_user_id = u1.id
            LEFT JOIN users u2 ON aa.target_user_id = u2.id
            ORDER BY aa.timestamp DESC
            LIMIT 10
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    
    return {
        stats,
        gameStats,
        recentActions,
        generatedAt: new Date().toISOString()
    };
}

// Admin Dashboard Overview
app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const dashboard = await getAdminDashboardData();
        res.json(dashboard);
    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

// ============================================================================
// USER MANAGEMENT APIS
// ============================================================================

// Get all users with pagination and search
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', sortBy = 'id', sortOrder = 'DESC' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let searchCondition = '';
        let searchParams = [];
        
        if (search) {
            searchCondition = 'WHERE username LIKE ? OR id = ?';
            searchParams = [`%${search}%`, search];
        }
        
        const users = await new Promise((resolve, reject) => {
            const query = `
                SELECT id, username, balance, role, account_status, 
                       created_at, last_login, total_deposits, total_withdrawals
                FROM users 
                ${searchCondition}
                ORDER BY ${sortBy} ${sortOrder}
                LIMIT ? OFFSET ?
            `;
            
            db.all(query, [...searchParams, parseInt(limit), offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const totalCount = await new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count FROM users ${searchCondition}`, searchParams, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        res.json({
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get specific user details
app.get('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await new Promise((resolve, reject) => {
            db.get(`
                SELECT id, username, balance, role, account_status, 
                       created_at, last_login, total_deposits, total_withdrawals
                FROM users WHERE id = ?
            `, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get recent transactions
        const recentTransactions = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM transactions 
                WHERE userId = ? 
                ORDER BY timestamp DESC 
                LIMIT 10
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({
            user,
            recentTransactions
        });
    } catch (error) {
        console.error('User details error:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Update user account status
app.put('/api/admin/users/:userId/status', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, reason } = req.body;
        
        const validStatuses = ['active', 'suspended', 'banned', 'pending'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Get current status for audit
        const currentUser = await new Promise((resolve, reject) => {
            db.get('SELECT account_status FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update status
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET account_status = ? WHERE id = ?', [status, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Log admin action
        await logAdminAction(
            req.user.id,
            'status_change',
            userId,
            { reason, newStatus: status },
            currentUser.account_status,
            status
        );
        
        res.json({ message: 'User status updated successfully' });
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Adjust user balance
app.post('/api/admin/users/:userId/balance', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, reason, type } = req.body;
        
        if (!amount || !reason || !type) {
            return res.status(400).json({ error: 'Amount, reason, and type are required' });
        }
        
        // Validate amount is a valid number
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || !isFinite(numAmount) || numAmount < 0) {
            return res.status(400).json({ error: 'Amount must be a valid positive number' });
        }
        
        if (!['add', 'subtract', 'set'].includes(type)) {
            return res.status(400).json({ error: 'Type must be add, subtract, or set' });
        }
        
        // Get current balance
        const currentBalance = await getUserBalance(userId);
        let newBalance;
        
        switch (type) {
            case 'add':
                newBalance = currentBalance + numAmount;
                break;
            case 'subtract':
                newBalance = currentBalance - numAmount;
                break;
            case 'set':
                newBalance = numAmount;
                break;
        }
        
        if (newBalance < 0) {
            return res.status(400).json({ error: 'Balance cannot be negative' });
        }
        
        // Update balance
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Log admin action
        await logAdminAction(
            req.user.id,
            'balance_adjustment',
            userId,
            { reason, type, amount: numAmount, newBalance },
            currentBalance.toString(),
            newBalance.toString()
        );
        
        res.json({ 
            message: 'Balance adjusted successfully',
            oldBalance: currentBalance,
            newBalance
        });
    } catch (error) {
        console.error('Balance adjustment error:', error);
        res.status(500).json({ error: 'Failed to adjust balance' });
    }
});

// ============================================================================
// TRANSACTION MONITORING APIS
// ============================================================================

// Get transaction analytics
app.get('/api/admin/analytics/transactions', authenticateAdmin, async (req, res) => {
    try {
        const { startDate, endDate, gameType } = req.query;
        
        let dateCondition = '';
        let params = [];
        
        if (startDate && endDate) {
            dateCondition = 'WHERE DATE(timestamp) BETWEEN ? AND ?';
            params = [startDate, endDate];
        }
        
        if (gameType && gameType !== 'all') {
            dateCondition += dateCondition ? ' AND game = ?' : 'WHERE game = ?';
            params.push(gameType);
        }
        
        const analytics = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    DATE(timestamp) as date,
                    COUNT(*) as transaction_count,
                    SUM(CASE WHEN type = 'win' THEN amount ELSE 0 END) as total_winnings,
                    SUM(CASE WHEN type = 'loss' OR type = 'bet' THEN amount ELSE 0 END) as total_losses,
                    game
                FROM transactions 
                ${dateCondition}
                GROUP BY DATE(timestamp), game
                ORDER BY date DESC
            `, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({ analytics });
    } catch (error) {
        console.error('Transaction analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch transaction analytics' });
    }
});

// Get detailed transaction history
app.get('/api/admin/transactions', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, userId, gameType, transactionType } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let conditions = [];
        let params = [];
        
        if (userId) {
            conditions.push('t.userId = ?');
            params.push(userId);
        }
        
        if (gameType && gameType !== 'all') {
            conditions.push('t.game = ?');
            params.push(gameType);
        }
        
        if (transactionType && transactionType !== 'all') {
            conditions.push('t.type = ?');
            params.push(transactionType);
        }
        
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        
        const transactions = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.*, u.username 
                FROM transactions t
                LEFT JOIN users u ON t.userId = u.id
                ${whereClause}
                ORDER BY t.timestamp DESC
                LIMIT ? OFFSET ?
            `, [...params, parseInt(limit), offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const totalCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count 
                FROM transactions t
                ${whereClause}
            `, params, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        res.json({
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Transaction history error:', error);
        res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
});

// ============================================================================
// SYSTEM CONFIGURATION APIS
// ============================================================================

// Get all system settings
app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM system_settings ORDER BY category, setting_key', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Group by category
        const groupedSettings = settings.reduce((acc, setting) => {
            const category = setting.category || 'general';
            if (!acc[category]) acc[category] = [];
            acc[category].push(setting);
            return acc;
        }, {});
        
        res.json({ settings: groupedSettings });
    } catch (error) {
        console.error('Settings fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update system setting
app.put('/api/admin/settings/:settingKey', authenticateAdmin, async (req, res) => {
    try {
        const { settingKey } = req.params;
        const { value, reason } = req.body;
        
        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }
        
        // Get current value for audit
        const currentSetting = await new Promise((resolve, reject) => {
            db.get('SELECT setting_value FROM system_settings WHERE setting_key = ?', [settingKey], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!currentSetting) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        
        // Update setting
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
                [value.toString(), settingKey],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Log admin action
        await logAdminAction(
            req.user.id,
            'setting_update',
            null,
            { settingKey, reason },
            currentSetting.setting_value,
            value.toString()
        );
        
        res.json({ message: 'Setting updated successfully' });
    } catch (error) {
        console.error('Setting update error:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

// Get admin audit log
app.get('/api/admin/audit-log', authenticateAdmin, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    db.all(
        `SELECT aa.*, u1.username as admin_username, u2.username as target_username
         FROM admin_actions aa
         LEFT JOIN users u1 ON aa.admin_user_id = u1.id
         LEFT JOIN users u2 ON aa.target_user_id = u2.id
         ORDER BY aa.timestamp DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch audit log' });
            res.json({ auditLog: rows, page, limit });
        }
    );
});

// ============================================================================
// GAME LOGIC SERVICES
// ============================================================================

// Random number generation and seeding
const crypto = require('crypto');

function generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
}

function generateClientSeed() {
    return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Provably fair random number generator
function generateProvablyFairNumber(serverSeed, clientSeed, nonce = 0) {
    const combined = `${serverSeed}:${clientSeed}:${nonce}`;
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    return parseInt(hash.substring(0, 8), 16) / 0xffffffff;
}

// House edge calculations
async function getHouseEdge(gameType) {
    const settings = await getSystemSettings();
    const houseEdgeKey = `house_edge_${gameType.replace('-', '_')}`;
    return settings[houseEdgeKey] || 3.0;
}

// Game result generation
async function generateGameResult(gameType, serverSeed, clientSeed, gameParams = {}) {
    const random = generateProvablyFairNumber(serverSeed, clientSeed);
    const houseEdge = await getHouseEdge(gameType);
    
    switch (gameType) {
        case 'crash':
        case 'aviator':
            return generateCrashResult(random, houseEdge, gameParams);
            
        case 'dice':
            return generateDiceResult(random, gameParams.target || 50, gameParams.rollOver || true);
            
        case 'coinflip':
            return await generateCoinflipResult(random, { ...gameParams, serverSeed, clientSeed });
            
        case 'color-trading':
            return generateColorTradingResult(random, houseEdge);
            
        default:
            throw new Error(`Unknown game type: ${gameType}`);
    }
}

// Crash/Aviator game logic  
function generateCrashResult(random, houseEdge, gameParams = {}) {
    // Apply house edge by adjusting the crash point distribution
    const adjustedRandom = Math.pow(random, 1 + (houseEdge / 100));
    
    let crashPoint;
    
    // Crash point calculation with realistic distribution
    if (adjustedRandom < 0.4) {
        crashPoint = 1.00 + (adjustedRandom * 1.2);
    } else if (adjustedRandom < 0.75) {
        crashPoint = 2.2 + (adjustedRandom * 1.8);
    } else if (adjustedRandom < 0.95) {
        crashPoint = 4.0 + (adjustedRandom * 0.8);
    } else {
        crashPoint = 4.8 + (adjustedRandom * 0.2);
    }
    
    // Ensure minimum crash point
    crashPoint = Math.max(crashPoint, 1.00);
    
    // Check if user cashed out before crash
    const cashoutPoint = gameParams.cashoutPoint || null;
    const userCashedOut = cashoutPoint && cashoutPoint < crashPoint;
    
    return {
        crashPoint: parseFloat(crashPoint.toFixed(2)),
        cashoutPoint: userCashedOut ? cashoutPoint : null,
        userCashedOut,
        crashed: true,
        houseEdge
    };
}

// Dice game logic
function generateDiceResult(random, target, rollOver) {
    const roll = Math.floor(random * 100) + 1;
    const win = rollOver ? roll > target : roll < target;
    
    return {
        roll,
        target,
        rollOver,
        win,
        winChance: rollOver ? (100 - target) : target
    };
}

// Coinflip game logic
async function generateCoinflipResult(random, gameParams = {}) {
    const result = random < 0.5 ? 'heads' : 'tails';
    const userChoice = gameParams.choice || 'heads';
    
    // Get house edge and calculate biased win probability
    const houseEdge = await getHouseEdge('coinflip');
    const fairWinChance = 0.5; // 50% in a fair coin flip
    const biasedWinChance = fairWinChance * (1 - houseEdge / 100);
    
    // Use a second random number to determine if user wins
    // This creates the house edge by reducing user's win probability
    const winRandom = generateProvablyFairNumber(gameParams.serverSeed, gameParams.clientSeed, 1);
    const win = (result === userChoice) && (winRandom < biasedWinChance / fairWinChance);
    
    return {
        result,
        userChoice,
        win,
        fairWinChance,
        biasedWinChance,
        houseEdge
    };
}

// Color trading game logic
function generateColorTradingResult(random, houseEdge) {
    // Adjust probability with house edge
    const adjustedRandom = random * (1 + houseEdge / 100);
    
    let color, multiplier;
    
    if (adjustedRandom < 0.5) {
        color = 'red';
        multiplier = 2.0;
    } else if (adjustedRandom < 0.75) {
        color = 'green';
        multiplier = 14.0;
    } else if (adjustedRandom < 0.9) {
        color = 'blue';
        multiplier = 5.0;
    } else {
        color = 'yellow';
        multiplier = 50.0;
    }
    
    return {
        color,
        multiplier,
        random: adjustedRandom
    };
}

// Game result verification
function verifyGameResult(gameType, clientResult, serverResult) {
    switch (gameType) {
        case 'crash':
        case 'aviator':
            return Math.abs(clientResult.crashPoint - serverResult.crashPoint) < 0.01;
            
        case 'dice':
            return clientResult.roll === serverResult.roll;
            
        case 'coinflip':
            return clientResult.result === serverResult.result;
            
        case 'color-trading':
            return clientResult.color === serverResult.color;
            
        default:
            return false;
    }
}

// Payout calculation
async function calculatePayout(gameType, betAmount, gameResult) {
    switch (gameType) {
        case 'crash':
        case 'aviator':
            // Payout depends on whether user cashed out before crash
            return gameResult.userCashedOut 
                ? betAmount * gameResult.cashoutPoint
                : 0;
                
        case 'dice':
            if (!gameResult.win) return 0;
            const winChance = gameResult.winChance;
            return betAmount * (99 / winChance);
            
        case 'coinflip':
            return gameResult.win ? betAmount * 2.0 : 0;
            
        case 'color-trading':
            return betAmount * gameResult.multiplier;
            
        default:
            return 0;
    }
}

// ============================================================================
// DEPOSIT/WITHDRAWAL SYSTEM API ENDPOINTS
// ============================================================================

// Get EasyPaisa settings for user display
app.get('/api/payment/easypaisa-info', async (req, res) => {
    try {
        const settings = await getSystemSettings();
        res.json({
            accountNumber: settings.easypaisa_account_number,
            accountName: settings.easypaisa_account_name,
            minDeposit: settings.min_deposit_amount,
            maxDeposit: settings.max_deposit_amount,
            minWithdrawal: settings.min_withdrawal_amount,
            maxWithdrawal: settings.max_withdrawal_amount
        });
    } catch (error) {
        console.error('EasyPaisa info error:', error);
        res.status(500).json({ error: 'Failed to fetch payment information' });
    }
});

// Create deposit request
app.post('/api/deposit/request', authenticateToken, async (req, res) => {
    const { amount, userEasypaisaNumber, userEasypaisaName } = req.body;
    
    // Validation
    if (!amount || !userEasypaisaNumber || !userEasypaisaName) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Validate Pakistani mobile number format
    const phoneRegex = /^03\d{9}$/;
    if (!phoneRegex.test(userEasypaisaNumber)) {
        return res.status(400).json({ error: 'Invalid EasyPaisa number format. Use: 03xxxxxxxxx' });
    }
    
    try {
        const settings = await getSystemSettings();
        
        // Check amount limits
        if (amount < settings.min_deposit_amount) {
            return res.status(400).json({ error: `Minimum deposit amount is Rs.${settings.min_deposit_amount}` });
        }
        
        if (amount > settings.max_deposit_amount) {
            return res.status(400).json({ error: `Maximum deposit amount is Rs.${settings.max_deposit_amount}` });
        }
        
        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const dailyDeposits = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM deposit_withdrawal_requests 
                WHERE user_id = ? AND request_type = 'deposit' 
                AND DATE(created_at) = ? AND status != 'rejected'
            `, [req.user.id, today], (err, row) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });
        
        if (dailyDeposits + amount > settings.daily_deposit_limit) {
            return res.status(400).json({ error: `Daily deposit limit of Rs.${settings.daily_deposit_limit} exceeded` });
        }
        
        // Create deposit request
        const requestId = await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO deposit_withdrawal_requests 
                (user_id, request_type, amount, user_easypaisa_number, user_easypaisa_name, 
                 admin_easypaisa_number, admin_easypaisa_name)
                VALUES (?, 'deposit', ?, ?, ?, ?, ?)
            `, [
                req.user.id, amount, userEasypaisaNumber, userEasypaisaName,
                settings.easypaisa_account_number, settings.easypaisa_account_name
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
        
        res.json({
            success: true,
            requestId,
            message: 'Deposit request submitted successfully. Awaiting admin approval.',
            adminAccount: {
                number: settings.easypaisa_account_number,
                name: settings.easypaisa_account_name
            }
        });
        
    } catch (error) {
        console.error('Deposit request error:', error);
        res.status(500).json({ error: 'Failed to process deposit request' });
    }
});

// Create withdrawal request
app.post('/api/withdrawal/request', authenticateToken, async (req, res) => {
    const { amount, userEasypaisaNumber, userEasypaisaName } = req.body;
    
    // Validation
    if (!amount || !userEasypaisaNumber || !userEasypaisaName) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Validate Pakistani mobile number format
    const phoneRegex = /^03\d{9}$/;
    if (!phoneRegex.test(userEasypaisaNumber)) {
        return res.status(400).json({ error: 'Invalid EasyPaisa number format. Use: 03xxxxxxxxx' });
    }
    
    try {
        const settings = await getSystemSettings();
        const userBalance = await getUserBalance(req.user.id);
        
        // Check amount limits
        if (amount < settings.min_withdrawal_amount) {
            return res.status(400).json({ error: `Minimum withdrawal amount is Rs.${settings.min_withdrawal_amount}` });
        }
        
        if (amount > settings.max_withdrawal_amount) {
            return res.status(400).json({ error: `Maximum withdrawal amount is Rs.${settings.max_withdrawal_amount}` });
        }
        
        // Check user balance
        if (amount > userBalance) {
            return res.status(400).json({ error: `Insufficient balance. Your balance: Rs.${userBalance}` });
        }
        
        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const dailyWithdrawals = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM deposit_withdrawal_requests 
                WHERE user_id = ? AND request_type = 'withdrawal' 
                AND DATE(created_at) = ? AND status != 'rejected'
            `, [req.user.id, today], (err, row) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });
        
        if (dailyWithdrawals + amount > settings.daily_withdrawal_limit) {
            return res.status(400).json({ error: `Daily withdrawal limit of Rs.${settings.daily_withdrawal_limit} exceeded` });
        }
        
        // Create withdrawal request
        const requestId = await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO deposit_withdrawal_requests 
                (user_id, request_type, amount, user_easypaisa_number, user_easypaisa_name)
                VALUES (?, 'withdrawal', ?, ?, ?)
            `, [req.user.id, amount, userEasypaisaNumber, userEasypaisaName], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
        
        res.json({
            success: true,
            requestId,
            message: 'Withdrawal request submitted successfully. Awaiting admin approval.',
            userAccount: {
                number: userEasypaisaNumber,
                name: userEasypaisaName
            }
        });
        
    } catch (error) {
        console.error('Withdrawal request error:', error);
        res.status(500).json({ error: 'Failed to process withdrawal request' });
    }
});

// Get user's deposit/withdrawal requests
app.get('/api/user/requests', authenticateToken, async (req, res) => {
    try {
        const requests = await new Promise((resolve, reject) => {
            db.all(`
                SELECT id, request_type, amount, user_easypaisa_number, user_easypaisa_name,
                       admin_easypaisa_number, admin_easypaisa_name, status, admin_notes,
                       created_at, processed_at
                FROM deposit_withdrawal_requests 
                WHERE user_id = ? 
                ORDER BY created_at DESC
            `, [req.user.id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({ requests });
    } catch (error) {
        console.error('User requests error:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Admin: Get all deposit/withdrawal requests
app.get('/api/admin/requests', authenticateAdmin, async (req, res) => {
    
    try {
        const { status = 'all', page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let statusCondition = '';
        let params = [];
        
        if (status !== 'all') {
            statusCondition = 'WHERE dwr.status = ?';
            params.push(status);
        }
        
        
        const requests = await new Promise((resolve, reject) => {
            const query = `
                SELECT dwr.*, u.username, u.id as user_id,
                       admin_u.username as processed_by_username
                FROM deposit_withdrawal_requests dwr
                JOIN users u ON dwr.user_id = u.id
                LEFT JOIN users admin_u ON dwr.processed_by = admin_u.id
                ${statusCondition}
                ORDER BY dwr.created_at DESC
                LIMIT ? OFFSET ?
            `;
            
            db.all(query, [...params, parseInt(limit), offset], (err, rows) => {
                if (err) {
                    console.error('🚨 SQL Error:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
        
        const totalCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count 
                FROM deposit_withdrawal_requests dwr
                ${statusCondition}
            `, params, (err, row) => {
                if (err) {
                    console.error('🚨 Count SQL Error:', err);
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
        
        const response = {
            requests,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        };
        
        res.json(response);
    } catch (error) {
        console.error('🚨 Admin requests error:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

// Admin: Get single deposit/withdrawal request details
app.get('/api/admin/requests/:requestId', authenticateAdmin, async (req, res) => {
    const { requestId } = req.params;
    
    try {
        const request = await new Promise((resolve, reject) => {
            db.get(`
                SELECT dwr.*, u.username, u.id as user_id,
                       admin_u.username as processed_by_username
                FROM deposit_withdrawal_requests dwr
                JOIN users u ON dwr.user_id = u.id
                LEFT JOIN users admin_u ON dwr.processed_by = admin_u.id
                WHERE dwr.id = ?
            `, [requestId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        res.json(request);
    } catch (error) {
        console.error('Admin request details error:', error);
        res.status(500).json({ error: 'Failed to fetch request details' });
    }
});

// Admin: Process deposit/withdrawal request
app.post('/api/admin/requests/:requestId', authenticateAdmin, async (req, res) => {
    const { requestId } = req.params;
    const { action, adminNotes } = req.body; // action: 'approve' or 'reject'
    
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Use approve or reject.' });
    }
    
    try {
        // Get request details
        const request = await new Promise((resolve, reject) => {
            db.get(`
                SELECT * FROM deposit_withdrawal_requests 
                WHERE id = ? AND status = 'pending'
            `, [requestId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!request) {
            return res.status(404).json({ error: 'Request not found or already processed' });
        }
        
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        
        // Update request status
        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE deposit_withdrawal_requests 
                SET status = ?, admin_notes = ?, processed_by = ?, processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [newStatus, adminNotes, req.user.id, requestId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // If approved, update user balance and create transaction
        if (action === 'approve') {
            const balanceChange = request.request_type === 'deposit' ? request.amount : -request.amount;
            const transactionType = request.request_type === 'deposit' ? 'deposit' : 'withdrawal';
            
            // Update user balance
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET balance = balance + ? WHERE id = ?', 
                    [balanceChange, request.user_id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
            
            // Create transaction record
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO transactions 
                    (userId, type, amount, game, game_session_id, bet_details, transaction_status)
                    VALUES (?, ?, ?, ?, ?, ?, 'completed')
                `, [
                    request.user_id, transactionType, request.amount, 'system',
                    `req_${requestId}`, JSON.stringify({
                        requestId: requestId,
                        easypaisaNumber: request.user_easypaisa_number,
                        easypaisaName: request.user_easypaisa_name,
                        processedBy: req.user.username
                    })
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        
        // Log admin action
        await logAdminAction(
            req.user.id,
            `${request.request_type}_${action}`,
            request.user_id,
            { 
                requestId: requestId,
                amount: request.amount,
                adminNotes: adminNotes,
                easypaisaDetails: {
                    number: request.user_easypaisa_number,
                    name: request.user_easypaisa_name
                }
            },
            'pending',
            newStatus
        );
        
        res.json({
            success: true,
            message: `${request.request_type} request ${action}d successfully`,
            newBalance: action === 'approve' ? await getUserBalance(request.user_id) : null
        });
        
    } catch (error) {
        console.error('Process request error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Admin: Get EasyPaisa settings
app.get('/api/admin/settings/easypaisa', authenticateAdmin, async (req, res) => {
    try {
        const settings = await getSystemSettings();
        res.json({
            accountNumber: settings.easypaisa_account_number,
            accountName: settings.easypaisa_account_name,
            minDeposit: settings.min_deposit_amount,
            maxDeposit: settings.max_deposit_amount,
            minWithdrawal: settings.min_withdrawal_amount,
            maxWithdrawal: settings.max_withdrawal_amount,
            dailyDepositLimit: settings.daily_deposit_limit,
            dailyWithdrawalLimit: settings.daily_withdrawal_limit
        });
    } catch (error) {
        console.error('EasyPaisa settings error:', error);
        res.status(500).json({ error: 'Failed to fetch EasyPaisa settings' });
    }
});

// Admin: Update EasyPaisa settings
app.post('/api/admin/settings/easypaisa', authenticateAdmin, async (req, res) => {
    const { 
        accountNumber, accountName, minDeposit, maxDeposit, 
        minWithdrawal, maxWithdrawal, dailyLimit 
    } = req.body;
    
    // Validate Pakistani mobile number format
    if (accountNumber) {
        const phoneRegex = /^03\d{9}$/;
        if (!phoneRegex.test(accountNumber)) {
            return res.status(400).json({ error: 'Invalid EasyPaisa number format. Use: 03xxxxxxxxx' });
        }
    }
    
    try {
        const updates = {
            easypaisa_account_number: accountNumber,
            easypaisa_account_name: accountName,
            min_deposit_amount: minDeposit,
            max_deposit_amount: maxDeposit,
            min_withdrawal_amount: minWithdrawal,
            max_withdrawal_amount: maxWithdrawal,
            daily_deposit_limit: dailyLimit,
            daily_withdrawal_limit: dailyLimit
        };
        
        // Update each setting
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                await new Promise((resolve, reject) => {
                    db.run(`
                        UPDATE system_settings 
                        SET setting_value = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE setting_key = ?
                    `, [value, key], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        }
        
        // Log admin action
        await logAdminAction(
            req.user.id,
            'easypaisa_settings_update',
            null,
            updates,
            null,
            JSON.stringify(updates)
        );
        
        res.json({ message: 'EasyPaisa settings updated successfully' });
        
    } catch (error) {
        console.error('EasyPaisa settings update error:', error);
        res.status(500).json({ error: 'Failed to update EasyPaisa settings' });
    }
});

// ============================================================================
// NEW ROUND-BASED API ENDPOINTS
// ============================================================================

// Get current round info
app.get('/api/game/aviator/current-round', authenticateToken, (req, res) => {
    if (!currentAviatorRound) {
        return res.json({ status: 'no_active_round' });
    }
    
    res.json({
        roundId: currentAviatorRound.id,
        roundNumber: currentAviatorRound.roundNumber,
        status: currentAviatorRound.status,
        bettingTimeLeft: currentAviatorRound.status === ROUND_STATUS.BETTING ? 10 : 0
    });
});

// Place bet in current round
app.post('/api/game/aviator/round-bet', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    
    // Validate input
    if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Invalid bet amount' });
    }
    
    if (!currentAviatorRound || currentAviatorRound.status !== ROUND_STATUS.BETTING) {
        return res.status(400).json({ error: 'No active betting round' });
    }
    
    // Check balance
    const userBalance = await getUserBalance(req.user.id);
    if (userBalance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    try {
        // Check if user already has bet in this round
        const existingBet = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM round_participants WHERE round_id = ? AND user_id = ?', 
                [currentAviatorRound.id, req.user.id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
        });
        
        if (existingBet) {
            return res.status(400).json({ error: 'Already placed bet in this round' });
        }
        
        // Deduct bet amount immediately
        const betTransaction = await processEnhancedTransaction({
            userId: req.user.id,
            type: 'bet',
            amount: amount,
            game: 'aviator',
            gameSessionId: currentAviatorRound.id,
            betDetails: {
                roundId: currentAviatorRound.id,
                roundNumber: currentAviatorRound.roundNumber,
                roundBased: true
            },
            betMultiplier: 0
        });
        
        // Add participant to round
        await addParticipantToRound(currentAviatorRound.id, req.user.id, amount);
        
        // Broadcast bet to other players
        io.to('aviator').emit('player-bet', {
            username: req.user.username,
            amount: amount,
            roundId: currentAviatorRound.id
        });
        
        res.json({
            success: true,
            roundId: currentAviatorRound.id,
            transactionId: betTransaction,
            newBalance: await getUserBalance(req.user.id)
        });
        
    } catch (error) {
        console.error('Round bet placement error:', error);
        res.status(500).json({ error: 'Failed to place bet' });
    }
});

// Cashout in current round
app.post('/api/game/aviator/round-cashout', authenticateToken, async (req, res) => {
    const { cashoutMultiplier } = req.body;
    
    // Validate input
    if (!cashoutMultiplier || cashoutMultiplier < 1.0) {
        return res.status(400).json({ error: 'Invalid cashout multiplier' });
    }
    
    if (!currentAviatorRound || currentAviatorRound.status !== ROUND_STATUS.FLYING) {
        return res.status(400).json({ error: 'No active flight' });
    }
    
    // Check if cashout is valid (before crash)
    if (cashoutMultiplier >= currentAviatorRound.crashPoint) {
        return res.status(400).json({ 
            error: 'Too late! Flight crashed',
            crashPoint: currentAviatorRound.crashPoint
        });
    }
    
    try {
        // Process cashout
        const cashoutResult = await processCashout(
            currentAviatorRound.id, 
            req.user.id, 
            cashoutMultiplier
        );
        
        // Broadcast cashout to other players
        io.to('aviator').emit('player-cashout', {
            username: req.user.username,
            multiplier: cashoutMultiplier,
            payout: cashoutResult.payout,
            roundId: currentAviatorRound.id
        });
        
        res.json({
            success: true,
            cashoutMultiplier,
            payout: cashoutResult.payout,
            newBalance: await getUserBalance(req.user.id)
        });
        
    } catch (error) {
        console.error('Round cashout error:', error);
        res.status(500).json({ error: error.message || 'Failed to process cashout' });
    }
});

// Game WebSocket logic for round-based system
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    let currentRoom = null;

    socket.on('join-game', (gameId) => {
        console.log(`👤 Client ${socket.id} joining game: ${gameId}`);
        
        // Leave previous room if any
        if (currentRoom) {
            socket.leave(currentRoom);
        }
        socket.join(gameId);
        currentRoom = gameId;
        
        // Send current round info when joining aviator
        if (gameId === 'aviator' && currentAviatorRound) {
            console.log(`📤 Sending current round status to ${socket.id}`);
            socket.emit('round-status', {
                roundId: currentAviatorRound.id,
                roundNumber: currentAviatorRound.roundNumber,
                status: currentAviatorRound.status,
                crashPoint: currentAviatorRound.status === ROUND_STATUS.FLYING ? currentAviatorRound.crashPoint : null
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Test endpoint for game logic (development only)
app.get('/api/test/game-logic/:gameType', async (req, res) => {
    try {
        const gameType = req.params.gameType;
        const serverSeed = generateServerSeed();
        const clientSeed = generateClientSeed();
        
        const gameResult = await generateGameResult(gameType, serverSeed, clientSeed);
        const payout = await calculatePayout(gameType, 100, gameResult);
        const houseEdge = await getHouseEdge(gameType);
        
        res.json({
            gameType,
            gameResult,
            payout,
            houseEdge,
            seeds: { serverSeed, clientSeed }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;

// Start server only after database is initialized
async function startServer() {
    try {
        // Initialize database first
        await initializeDatabase();
        
        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            
            // Initialize round-based game system
            initializeRoundSystem();
        });
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

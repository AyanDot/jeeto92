// Socket.io connection
const socket = io();
const currentGame = window.location.pathname.split('/').pop().replace('.html', '');

// Join game room
socket.emit('join-game', currentGame);

// Game-specific implementations
switch (currentGame) {
    case 'dice':
        initDiceGame();
        break;
    case 'coinflip':
        initCoinflipGame();
        break;
    case 'crash':
        initCrashGame();
        break;
    case 'color-trading':
        initColorTradingGame();
        break;
    case 'aviator':
        initAviatorGame();
        break;
}

// Dice game implementation
function initDiceGame() {
    const diceEl = document.getElementById('dice');
    const betAmount = document.getElementById('betAmount');
    const betType = document.getElementById('betType');
    const rollBtn = document.getElementById('rollBtn');
    const result = document.getElementById('result');
    const history = document.getElementById('rollHistory');
    
    const diceChars = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    
    rollBtn.addEventListener('click', async () => {
        if (!betAmount.value || betAmount.value <= 0) {
            alert('Please enter a valid bet amount');
            return;
        }
        
        const amount = parseFloat(betAmount.value);
        const type = betType.value;
        
        // Simulate roll
        rollBtn.disabled = true;
        diceEl.style.animation = 'none';
        void diceEl.offsetWidth; // Trigger reflow
        diceEl.style.animation = 'roll 0.5s ease';
        
        // Random roll between 1-6
        const roll = Math.floor(Math.random() * 6) + 1;
        
        setTimeout(async () => {
            diceEl.textContent = diceChars[roll - 1];
            
            // Check win condition
            const isWin = (type === 'high' && roll > 3) || (type === 'low' && roll <= 3);
            
            if (isWin) {
                result.textContent = `You won Rs.${amount}!`;
                result.className = 'result win';
                await API.recordTransaction('win', amount, 'dice');
            } else {
                result.textContent = `You lost Rs.${amount}`;
                result.className = 'result lose';
                await API.recordTransaction('loss', amount, 'dice');
            }
            
            // Update balance
            await API.updateBalance();
            
            // Add to history
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <span>Roll: ${roll}</span>
                <span class="${isWin ? 'win' : 'lose'}">${isWin ? '+' : '-'}Rs.${amount}</span>
            `;
            history.insertBefore(historyItem, history.firstChild);
            
            rollBtn.disabled = false;
        }, 500);
    });
}

// Coinflip game implementation
function initCoinflipGame() {
    const coin = document.getElementById('coin');
    const betAmount = document.getElementById('betAmount');
    const betChoice = document.getElementById('betChoice');
    const flipBtn = document.getElementById('flipBtn');
    const result = document.getElementById('result');
    const history = document.getElementById('flipHistory');
    
    flipBtn.addEventListener('click', async () => {
        if (!betAmount.value || betAmount.value <= 0) {
            alert('Please enter a valid bet amount');
            return;
        }
        
        const amount = parseFloat(betAmount.value);
        const choice = betChoice.value;
        
        // Simulate flip
        flipBtn.disabled = true;
        coin.className = 'coin';
        void coin.offsetWidth; // Trigger reflow
        coin.className = 'coin flip';
        
        // Random result
        const flip = Math.random() < 0.5 ? 'heads' : 'tails';
        
        setTimeout(async () => {
            // Check win condition
            const isWin = choice === flip;
            
            if (isWin) {
                result.textContent = `You won Rs.${amount}!`;
                result.className = 'result win';
                await API.recordTransaction('win', amount, 'coinflip');
            } else {
                result.textContent = `You lost Rs.${amount}`;
                result.className = 'result lose';
                await API.recordTransaction('loss', amount, 'coinflip');
            }
            
            // Update balance
            await API.updateBalance();
            
            // Add to history
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <span>Result: ${flip}</span>
                <span class="${isWin ? 'win' : 'lose'}">${isWin ? '+' : '-'}Rs.${amount}</span>
            `;
            history.insertBefore(historyItem, history.firstChild);
            
            setTimeout(() => {
                coin.className = 'coin';
                flipBtn.disabled = false;
            }, 1000);
        }, 3000);
    });
}

// Crash game implementation
function initCrashGame() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const multiplier = document.getElementById('currentMultiplier');
    const betAmount = document.getElementById('betAmount');
    const autoStopAt = document.getElementById('autoStopAt');
    const betBtn = document.getElementById('betBtn');
    const cashoutBtn = document.getElementById('cashoutBtn');
    const result = document.getElementById('result');
    const history = document.getElementById('crashHistory');
    
    let gameInterval;
    let currentMultiplier = 1.00;
    let activeBet = null;
    
    // Canvas setup
    function resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Game loop
    function startGame() {
        let timeElapsed = 0;
        currentMultiplier = 1.00;
        
        gameInterval = setInterval(() => {
            timeElapsed += 16;
            currentMultiplier = Math.exp(timeElapsed / 2000);
            multiplier.textContent = currentMultiplier.toFixed(2);
            
            // Draw graph
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            
            for (let x = 0; x < canvas.width; x++) {
                const t = (x / canvas.width) * timeElapsed;
                const y = canvas.height - (Math.exp(t / 2000) - 1) * 50;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            
            ctx.stroke();
            
            // Check auto cashout
            if (activeBet && autoStopAt.value && currentMultiplier >= parseFloat(autoStopAt.value)) {
                cashout();
            }
            
            // Random crash
            if (Math.random() < 0.003) {
                crash();
            }
        }, 16);
    }
    
    function crash() {
        clearInterval(gameInterval);
        if (activeBet) {
            result.textContent = `You lost Rs.${activeBet}`;
            result.className = 'result lose';
            API.recordTransaction('loss', activeBet, 'crash')
                .then(() => API.updateBalance());
        }
        
        // Add to history
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `<span>Crashed @ ${currentMultiplier.toFixed(2)}x</span>`;
        history.insertBefore(historyItem, history.firstChild);
        
        setTimeout(() => {
            betBtn.disabled = false;
            cashoutBtn.disabled = true;
            startGame();
        }, 2000);
    }
    
    function cashout() {
        if (!activeBet) return;
        
        clearInterval(gameInterval);
        const winAmount = activeBet * currentMultiplier;
        result.textContent = `You won Rs.${winAmount.toFixed(2)}!`;
        result.className = 'result win';
        
        API.recordTransaction('win', winAmount, 'crash')
            .then(() => API.updateBalance());
        
        activeBet = null;
        betBtn.disabled = false;
        cashoutBtn.disabled = true;
        
        setTimeout(startGame, 2000);
    }
    
    // Start game
    startGame();
    
    // Event listeners
    betBtn.addEventListener('click', () => {
        if (!betAmount.value || betAmount.value <= 0) {
            alert('Please enter a valid bet amount');
            return;
        }
        
        activeBet = parseFloat(betAmount.value);
        betBtn.disabled = true;
        cashoutBtn.disabled = false;
    });
    
    cashoutBtn.addEventListener('click', cashout);
}

// Color Trading game implementation
function initColorTradingGame() {
    let selectedBet = { type: null, value: null };
    let betMultiplier = 5;
    let betType = 'big';
    let gameHistory = [];
    let currentGameId = generateGameId();
    let timeRemaining = 27;

    const numberColors = {
        0: ['green', 'violet'], 1: ['green'], 2: ['red'], 3: ['green'], 4: ['red'],
        5: ['green', 'violet'], 6: ['red'], 7: ['green'], 8: ['red'], 9: ['green']
    };

    function generateGameId() {
        const now = new Date();
        return now.getFullYear().toString() + 
               (now.getMonth() + 1).toString().padStart(2, '0') + 
               now.getDate().toString().padStart(2, '0') + 
               now.getHours().toString().padStart(2, '0') + 
               now.getMinutes().toString().padStart(2, '0') + 
               Math.floor(Math.random() * 100).toString().padStart(2, '0');
    }

    // Timer countdown
    function startTimer() {
        const timerInterval = setInterval(() => {
            timeRemaining--;
            document.getElementById('timer').innerHTML = `00:<span class="countdown">${timeRemaining.toString().padStart(2, '0')}</span>`;
            
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                if (selectedBet.type) {
                    playGame();
                }
                timeRemaining = 30;
                currentGameId = generateGameId();
                document.getElementById('gameId').textContent = currentGameId;
                startTimer();
            }
        }, 1000);
    }

    // Color button selection
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            document.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedBet = { type: 'color', value: this.dataset.color };
            updateBetAmount();
        });
    });

    // Number button selection
    document.querySelectorAll('.number-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedBet = { type: 'number', value: parseInt(this.dataset.number) };
            updateBetAmount();
        });
    });

    // Multiplier selection
    document.querySelectorAll('.multiplier-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.multiplier-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            betMultiplier = parseInt(this.dataset.multiplier);
            updateBetAmount();
        });
    });

    // Big/Small toggle
    document.querySelectorAll('.bet-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.bet-toggle').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            betType = this.dataset.type;
        });
    });

    // Random button
    document.querySelector('.random-btn').addEventListener('click', function() {
        const randomChoice = Math.random();
        if (randomChoice < 0.33) {
            // Select random color
            const colors = ['green', 'violet', 'red'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            document.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
            document.querySelector(`[data-color="${randomColor}"]`).classList.add('selected');
            selectedBet = { type: 'color', value: randomColor };
        } else {
            // Select random number
            const randomNumber = Math.floor(Math.random() * 10);
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            document.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));
            document.querySelector(`[data-number="${randomNumber}"]`).classList.add('selected');
            selectedBet = { type: 'number', value: randomNumber };
        }
        updateBetAmount();
    });

    function updateBetAmount() {
        const baseAmount = 10;
        const totalBet = baseAmount * betMultiplier;
        document.getElementById('betAmount').textContent = totalBet;
    }

    function getWinningNumber() {
        return Math.floor(Math.random() * 10);
    }

    function addToHistory(gameId, winningNumber, isWin, betAmount) {
        const colors = numberColors[winningNumber];
        const size = winningNumber >= 5 ? 'Big' : 'Small';
        
        gameHistory.unshift({
            gameId: gameId.slice(-10),
            number: winningNumber,
            size: size,
            colors: colors,
            won: isWin,
            amount: betAmount
        });

        if (gameHistory.length > 20) {
            gameHistory.pop();
        }

        updateHistoryDisplay();
    }

    function updateHistoryDisplay() {
        const historyDiv = document.getElementById('colorHistory');
        if (!historyDiv) return;
        
        historyDiv.innerHTML = gameHistory.map(game => `
            <div class="history-item">
                <span>Game: ${game.gameId}</span>
                <span>Number: ${game.number}</span>
                <span>Colors: ${game.colors.join(', ')}</span>
                <span class="${game.won ? 'win' : 'lose'}">${game.won ? '+' : '-'}Rs.${game.amount}</span>
            </div>
        `).join('');
    }

    async function playGame() {
        if (!selectedBet.type) {
            alert('Please select a color or number first!');
            return;
        }

        const betAmount = parseInt(document.getElementById('betAmount').textContent);
        const result = document.getElementById('result');
        
        // Disable play button during game
        const playBtn = document.getElementById('playBtn');
        playBtn.disabled = true;

        const winningNumber = getWinningNumber();
        const winningColors = numberColors[winningNumber];
        const winningSize = winningNumber >= 5 ? 'big' : 'small';
        
        let won = false;
        let winType = '';
        let payout = 0;

        if (selectedBet.type === 'color') {
            if (winningColors.includes(selectedBet.value)) {
                won = true;
                winType = `Color: ${selectedBet.value}`;
                if (selectedBet.value === 'green' || selectedBet.value === 'red') {
                    payout = 2;
                } else if (selectedBet.value === 'violet') {
                    payout = 4.5;
                }
            }
        } else if (selectedBet.type === 'number') {
            if (winningNumber === selectedBet.value) {
                won = true;
                winType = `Number: ${selectedBet.value}`;
                payout = 9;
            }
        }

        let amount;
        if (won) {
            amount = Math.floor(betAmount * payout);
            result.textContent = `You won Rs.${amount}! (Number: ${winningNumber}, Colors: ${winningColors.join(', ')})`;
            result.className = 'result win';
            await API.recordTransaction('win', amount, 'color-trading');
        } else {
            amount = betAmount;
            result.textContent = `You lost Rs.${amount} (Number: ${winningNumber}, Colors: ${winningColors.join(', ')})`;
            result.className = 'result lose';
            await API.recordTransaction('loss', amount, 'color-trading');
        }

        // Update balance
        await API.updateBalance();

        // Add to history
        addToHistory(currentGameId, winningNumber, won, won ? amount : betAmount);

        // Reset selection
        document.querySelectorAll('.color-btn, .number-btn').forEach(b => b.classList.remove('selected'));
        selectedBet = { type: null, value: null };
        
        // Re-enable play button
        setTimeout(() => {
            playBtn.disabled = false;
            result.textContent = '';
        }, 3000);
    }

    // Play button event listener
    document.getElementById('playBtn').addEventListener('click', playGame);

    // Initialize
    updateBetAmount();
    document.getElementById('gameId').textContent = currentGameId;
    startTimer();

    // Add some initial history
    for (let i = 0; i < 5; i++) {
        const randomNumber = Math.floor(Math.random() * 10);
        addToHistory(generateGameId(), randomNumber, Math.random() > 0.5, Math.floor(Math.random() * 200) + 50);
    }
}

// Aviator game implementation
function initAviatorGame() {
    let gameState = 'waiting';
    let currentBet = 0;
    let currentMultiplier = 1.00;
    let maxMultiplier = 5.00;
    let crashPoint = 0;
    let gameStartTime;
    let flightPath = [];
    let animationId;
    let exhaustTrailActive = false;
    let gameHistory = [];

    function setBet(amount) {
        if (gameState === 'waiting') {
            document.getElementById('betInput').value = amount;
            const betInput = document.getElementById('betInput');
            betInput.style.transform = 'scale(1.05)';
            setTimeout(() => {
                betInput.style.transform = 'scale(1)';
            }, 150);
        }
    }

    // Add quick bet functionality
    document.querySelectorAll('.quick-bet').forEach(btn => {
        btn.addEventListener('click', function() {
            const amount = this.textContent.replace('Rs.', '');
            setBet(parseInt(amount));
        });
    });

    async function placeBet() {
        if (gameState !== 'waiting') return;

        const betAmount = parseInt(document.getElementById('betInput').value);
        if (betAmount < 10) {
            showNotification('Minimum bet is Rs.10', 'error');
            return;
        }

        currentBet = betAmount;
        
        // Disable bet button during game
        const actionBtn = document.getElementById('actionBtn');
        actionBtn.disabled = true;
        
        await API.recordTransaction('loss', betAmount, 'aviator');
        await API.updateBalance();
        
        startFlight();
    }

    async function cashOut() {
        if (gameState !== 'flying' || currentBet === 0) return;

        const winAmount = Math.floor(currentBet * currentMultiplier);
        currentBet = 0;

        showNotification(`Successful cashout: Rs.${winAmount}!`, 'success');
        updateGameStatus('Cashed Out Successfully!', 'flying', `Profit: Rs.${winAmount - parseInt(document.getElementById('betInput').value)}`);
        
        await API.recordTransaction('win', winAmount, 'aviator');
        await API.updateBalance();
        
        document.getElementById('actionBtn').textContent = 'Launch Flight';
        document.getElementById('actionBtn').className = 'action-btn bet-btn';
        document.getElementById('actionBtn').onclick = placeBet;

        stopExhaustTrail();

        addToHistory(crashPoint, true, winAmount);

        setTimeout(() => {
            if (gameState === 'flying') {
                updateGameStatus('Flight Continuing...', 'flying', 'Aircraft still airborne');
            }
        }, 2500);
    }

    function showNotification(message, type) {
        const result = document.getElementById('result');
        result.textContent = message;
        result.className = `result ${type === 'success' ? 'win' : 'lose'}`;
        
        setTimeout(() => {
            result.textContent = '';
            result.className = 'result';
        }, 3000);
    }

    function updateMultiplierDisplay() {
        const display = document.getElementById('multiplierDisplay');
        display.textContent = currentMultiplier.toFixed(2) + 'x';
        
        if (currentMultiplier >= 5.0) {
            display.style.color = '#ff6b35';
        } else if (currentMultiplier >= 2.0) {
            display.style.color = '#FFD700';
        } else {
            display.style.color = '#2ecc71';
        }
    }

    function updateGameStatus(text, status, details = '') {
        const statusEl = document.getElementById('gameStatusBottom');
        const detailsEl = document.getElementById('statusDetails');
        statusEl.className = `game-status-bottom ${status}`;
        statusEl.textContent = text;
        detailsEl.textContent = details;
    }

    function startExhaustTrail() {
        const exhaustTrail = document.getElementById('exhaustTrail');
        exhaustTrail.classList.add('active');
        exhaustTrailActive = true;
    }

    function stopExhaustTrail() {
        const exhaustTrail = document.getElementById('exhaustTrail');
        exhaustTrail.classList.remove('active');
        exhaustTrailActive = false;
    }

    function createAdvancedCrashExplosion() {
        const plane = document.getElementById('plane');
        const planeRect = plane.getBoundingClientRect();
        const flightArea = document.querySelector('.flight-area');
        const flightRect = flightArea.getBoundingClientRect();
        
        const planeX = planeRect.left - flightRect.left + (planeRect.width / 2);
        const planeY = planeRect.top - flightRect.top + (planeRect.height / 2);
        
        const explosion = document.getElementById('crashExplosion');
        explosion.style.left = (planeX - 75) + 'px';
        explosion.style.top = (planeY - 75) + 'px';
        explosion.classList.add('active');
        
        const particleDirections = [
            { id: 'crashParticle1', dx: -45, dy: -30, delay: 0 },
            { id: 'crashParticle2', dx: 40, dy: -25, delay: 50 },
            { id: 'crashParticle3', dx: -35, dy: 35, delay: 100 },
            { id: 'crashParticle4', dx: 50, dy: 30, delay: 150 },
            { id: 'crashParticle5', dx: 0, dy: -50, delay: 200 },
            { id: 'crashParticle6', dx: -25, dy: 45, delay: 250 },
            { id: 'crashParticle7', dx: 35, dy: -35, delay: 300 },
            { id: 'crashParticle8', dx: -40, dy: 0, delay: 350 }
        ];
        
        particleDirections.forEach((particle) => {
            setTimeout(() => {
                const particleEl = document.getElementById(particle.id);
                particleEl.style.left = (planeX + particle.dx) + 'px';
                particleEl.style.top = (planeY + particle.dy) + 'px';
                particleEl.classList.add('active');
            }, particle.delay);
        });
        
        const currentRotation = plane.style.transform.match(/rotate\(([^)]+)\)/);
        const rotation = currentRotation ? currentRotation[1] : '0deg';
        plane.style.setProperty('--plane-rotation', rotation);
        plane.classList.add('crashed');
        
        stopExhaustTrail();
    }

    function generateRealisticCrashPoint() {
        const random = Math.random();
        if (random < 0.4) {
            return 1.00 + Math.random() * 1.2;
        } else if (random < 0.75) {
            return 2.2 + Math.random() * 1.8;
        } else if (random < 0.95) {
            return 4.0 + Math.random() * 0.8;
        } else {
            return 4.8 + Math.random() * 0.2;
        }
    }

    function resetAllCrashEffects() {
        const explosion = document.getElementById('crashExplosion');
        explosion.classList.remove('active');
        
        for (let i = 1; i <= 8; i++) {
            const particle = document.getElementById(`crashParticle${i}`);
            particle.classList.remove('active');
        }
        
        const plane = document.getElementById('plane');
        plane.classList.remove('crashed');
        plane.style.removeProperty('--plane-rotation');
    }

    function updateAdvancedPlaneAndTrail() {
        const flightArea = document.querySelector('.flight-area');
        const rect = flightArea.getBoundingClientRect();
        const plane = document.getElementById('plane');
        
        const timeProgress = Math.min((currentMultiplier - 1.00) / 4.00, 1);
        const visualProgress = Math.pow(timeProgress, 0.6);
        
        // Responsive positioning
        const isMobile = window.innerWidth <= 480;
        const isTablet = window.innerWidth <= 768;
        
        let startX = 40;
        let bottomOffset = 110;
        let endOffsetX = 180;
        
        if (isMobile) {
            startX = 20;
            bottomOffset = 88;
            endOffsetX = 100;
        } else if (isTablet) {
            startX = 30;
            bottomOffset = 90;
            endOffsetX = 130;
        }
        
        const startY = rect.height - bottomOffset;
        const endX = rect.width - endOffsetX;
        const endY = rect.height * 0.25;
        
        const x = startX + (visualProgress * (endX - startX));
        const heightProgress = Math.pow(visualProgress, 0.9);
        const y = startY - (heightProgress * (startY - endY));
        
        plane.style.left = x + 'px';
        plane.style.top = y + 'px';
        
        flightPath.push({ x: x + 70, y: y + 42, time: Date.now() });
        
        if (flightPath.length > 100) {
            flightPath.shift();
        }
        
        const trail = document.getElementById('flightTrail');
        if (flightPath.length > 2) {
            let pathData = `M ${flightPath[0].x} ${flightPath[0].y}`;
            
            for (let i = 1; i < flightPath.length - 1; i++) {
                const current = flightPath[i];
                const next = flightPath[i + 1];
                const cpx = (current.x + next.x) / 2;
                const cpy = (current.y + next.y) / 2;
                pathData += ` Q ${current.x} ${current.y} ${cpx} ${cpy}`;
            }
            
            if (flightPath.length > 1) {
                const last = flightPath[flightPath.length - 1];
                pathData += ` T ${last.x} ${last.y}`;
            }
            
            trail.setAttribute('d', pathData);
        }
        
        const flightAreaPath = document.getElementById('flightArea');
        if (flightPath.length > 1) {
            const groundLevel = rect.height - 25;
            
            let areaPath = `M ${flightPath[0].x} ${groundLevel}`;
            flightPath.forEach(point => {
                areaPath += ` L ${point.x} ${point.y}`;
            });
            areaPath += ` L ${flightPath[flightPath.length - 1].x} ${groundLevel} Z`;
            
            flightAreaPath.setAttribute('d', areaPath);
        }
    }

    function startFlight() {
        gameState = 'flying';
        gameStartTime = Date.now();
        crashPoint = generateRealisticCrashPoint();
        flightPath = [];
        
        updateGameStatus('Engines Starting...', 'flying', 'Aircraft preparing for takeoff');
        
        const plane = document.getElementById('plane');
        const flightArea = document.querySelector('.flight-area');
        const rect = flightArea.getBoundingClientRect();
        
        // Responsive starting position
        const isMobile = window.innerWidth <= 480;
        const isTablet = window.innerWidth <= 768;
        
        let startX = 40;
        let bottomOffset = 110;
        
        if (isMobile) {
            startX = 20;
            bottomOffset = 88;
        } else if (isTablet) {
            startX = 30;
            bottomOffset = 90;
        }
        
        plane.style.left = startX + 'px';
        plane.style.top = (rect.height - bottomOffset) + 'px';
        
        document.getElementById('flightTrail').setAttribute('d', 'M 0 0');
        document.getElementById('flightArea').setAttribute('d', 'M 0 0');
        
        setTimeout(() => {
            updateGameStatus('Airborne!', 'flying', 'Aircraft climbing - Cash out anytime!');
        }, 500);
        
        if (currentBet > 0) {
            document.getElementById('actionBtn').textContent = 'Cash Out';
            document.getElementById('actionBtn').className = 'action-btn cashout-btn';
            document.getElementById('actionBtn').onclick = cashOut;
            document.getElementById('actionBtn').disabled = false;
        }
    }

    function enhancedGameLoop() {
        if (gameState === 'flying') {
            const elapsed = (Date.now() - gameStartTime) / 1000;
            
            currentMultiplier = 1.00 + (elapsed * elapsed * 0.15) + (elapsed * 0.2);
            
            if (currentMultiplier > maxMultiplier) {
                currentMultiplier = maxMultiplier;
            }
            
            updateMultiplierDisplay();
            updateAdvancedPlaneAndTrail();
            
            if (currentMultiplier >= crashPoint) {
                gameState = 'crashed';
                
                createAdvancedCrashExplosion();
                
                document.getElementById('multiplierDisplay').className = 'multiplier-display crashed';
                updateGameStatus(`CRASHED at ${crashPoint.toFixed(2)}x!`, 'crashed', currentBet > 0 ? `Lost Rs.${currentBet}` : 'No bet placed');
                
                if (currentBet > 0) {
                    addToHistory(crashPoint, false, currentBet);
                    currentBet = 0;
                    showNotification(`Flight crashed! Better luck next time.`, 'error');
                }
                
                setTimeout(() => {
                    startNewRound();
                }, 4000);
            }
        }
        
        animationId = requestAnimationFrame(enhancedGameLoop);
    }

    function startNewRound() {
        gameState = 'waiting';
        currentMultiplier = 1.00;
        currentBet = 0;
        flightPath = [];
        
        resetAllCrashEffects();
        
        document.getElementById('multiplierDisplay').className = 'multiplier-display';
        updateMultiplierDisplay();
        updateGameStatus('Ready for Takeoff', 'waiting', 'Place your bet to begin flight');
        
        document.getElementById('actionBtn').textContent = 'Launch Flight';
        document.getElementById('actionBtn').className = 'action-btn bet-btn';
        document.getElementById('actionBtn').onclick = placeBet;
        document.getElementById('actionBtn').disabled = false;
        
        document.getElementById('flightTrail').setAttribute('d', 'M 0 0');
        document.getElementById('flightArea').setAttribute('d', 'M 0 0');
        
        const plane = document.getElementById('plane');
        const flightArea = document.querySelector('.flight-area');
        const rect = flightArea.getBoundingClientRect();
        
        // Responsive starting position
        const isMobile = window.innerWidth <= 480;
        const isTablet = window.innerWidth <= 768;
        
        let startX = 40;
        let bottomOffset = 110;
        
        if (isMobile) {
            startX = 20;
            bottomOffset = 88;
        } else if (isTablet) {
            startX = 30;
            bottomOffset = 90;
        }
        
        plane.style.left = startX + 'px';
        plane.style.top = (rect.height - bottomOffset) + 'px';
    }

    function addToHistory(multiplier, won, amount) {
        gameHistory.unshift({
            multiplier: multiplier.toFixed(2),
            won: won,
            amount: amount,
            time: new Date().toLocaleTimeString()
        });

        if (gameHistory.length > 20) {
            gameHistory.pop();
        }

        updateHistoryDisplay();
    }

    function updateHistoryDisplay() {
        const historyDiv = document.getElementById('aviatorHistory');
        if (!historyDiv) return;
        
        historyDiv.innerHTML = gameHistory.map(flight => `
            <div class="history-item">
                <span>Multiplier: ${flight.multiplier}x</span>
                <span>Time: ${flight.time}</span>
                <span class="${flight.won ? 'win' : 'lose'}">${flight.won ? '+' : '-'}Rs.${flight.amount}</span>
            </div>
        `).join('');
    }

    // Event listeners
    document.getElementById('actionBtn').addEventListener('click', placeBet);

    // Initialize
    updateMultiplierDisplay();
    enhancedGameLoop();
    
    setTimeout(() => {
        updateGameStatus('Welcome Aboard!', 'waiting', 'Ready for your first flight');
    }, 1000);

    function handleResize() {
        if (gameState === 'waiting') {
            const plane = document.getElementById('plane');
            const flightArea = document.querySelector('.flight-area');
            const rect = flightArea.getBoundingClientRect();
            
            // Adjust plane size and position based on screen size
            const isMobile = window.innerWidth <= 480;
            const isTablet = window.innerWidth <= 768;
            
            let planeOffset = 40;
            let bottomOffset = 110;
            
            if (isMobile) {
                bottomOffset = 88; // Smaller plane height + margin
            } else if (isTablet) {
                bottomOffset = 90; // Medium plane height + margin
            }
            
            plane.style.left = planeOffset + 'px';
            plane.style.top = (rect.height - bottomOffset) + 'px';
        }
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(handleResize, 100);
    });

    // Add some initial history
    for (let i = 0; i < 5; i++) {
        const randomMultiplier = 1.00 + Math.random() * 4.00;
        addToHistory(randomMultiplier, Math.random() > 0.5, Math.floor(Math.random() * 500) + 50);
    }
}

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
                result.textContent = `You won ₹${amount}!`;
                result.className = 'result win';
                await API.recordTransaction('win', amount, 'dice');
            } else {
                result.textContent = `You lost ₹${amount}`;
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
                <span class="${isWin ? 'win' : 'lose'}">${isWin ? '+' : '-'}₹${amount}</span>
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
                result.textContent = `You won ₹${amount}!`;
                result.className = 'result win';
                await API.recordTransaction('win', amount, 'coinflip');
            } else {
                result.textContent = `You lost ₹${amount}`;
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
                <span class="${isWin ? 'win' : 'lose'}">${isWin ? '+' : '-'}₹${amount}</span>
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
            result.textContent = `You lost ₹${activeBet}`;
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
        result.textContent = `You won ₹${winAmount.toFixed(2)}!`;
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

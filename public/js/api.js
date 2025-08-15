// API helper functions
const API = {
    token: localStorage.getItem('token'),
    
    async request(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        };
        
        try {
            const response = await fetch(`/api/${endpoint}`, {
                ...defaultOptions,
                ...options
            });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                window.location.href = '/index.html';
                return;
            }
            
            return await response.json();
        } catch (err) {
            console.error(`API Error: ${err.message}`);
            throw err;
        }
    },
    
    // Balance operations
    async getBalance() {
        const data = await this.request('balance');
        return data.balance;
    },
    
    async updateBalance() {
        const balance = await this.getBalance();
        document.querySelectorAll('#userBalance').forEach(el => {
            el.textContent = balance.toFixed(2);
        });
    },
    
    async recordTransaction(type, amount, game) {
        return await this.request('transaction', {
            method: 'POST',
            body: JSON.stringify({ type, amount, game })
        });
    },
    
    // Admin operations
    async getUsers(search = '') {
        return await this.request(`admin/users${search ? `?search=${search}` : ''}`);
    },
    
    async adjustBalance(userId, amount) {
        return await this.request('admin/balance', {
            method: 'POST',
            body: JSON.stringify({ userId, amount })
        });
    }
};

// Setup logout functionality
document.querySelectorAll('#logoutBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        window.location.href = '/index.html';
    });
});

// Update balance on page load
if (document.getElementById('userBalance')) {
    API.updateBalance();
}

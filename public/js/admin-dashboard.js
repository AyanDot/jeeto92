class AdminDashboard {
    constructor() {
        this.currentSection = 'dashboard';
        this.currentPage = 1;
        this.authToken = localStorage.getItem('token'); // Fixed: changed from 'authToken' to 'token'
        this.userRole = localStorage.getItem('role');
        this.adminUsername = 'Admin';
        
        this.init();
    }
    
    init() {
        // Check authentication and admin role
        if (!this.authToken || this.userRole !== 'admin') {
            window.location.href = '/';
            return;
        }
        
        // Initialize event listeners
        this.setupEventListeners();
        
        // Load initial dashboard
        this.loadDashboard();
    }
    
    setupEventListeners() {
        // Navigation menu
        document.querySelectorAll('.menu-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.switchSection(section);
            });
        });
        
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
        
        // Modal events
        this.setupModalEvents();
        
        // Form events
        this.setupFormEvents();
        
        // Search and filter events
        this.setupSearchEvents();
    }
    
    setupModalEvents() {
        // User modal
        document.getElementById('close-user-modal').addEventListener('click', () => {
            document.getElementById('user-modal').style.display = 'none';
        });
        
        // Balance modal
        document.getElementById('close-balance-modal').addEventListener('click', () => {
            document.getElementById('balance-modal').style.display = 'none';
        });
        
        document.getElementById('cancel-balance').addEventListener('click', () => {
            document.getElementById('balance-modal').style.display = 'none';
        });
        
        // Status modal
        document.getElementById('close-status-modal').addEventListener('click', () => {
            document.getElementById('status-modal').style.display = 'none';
        });
        
        document.getElementById('cancel-status').addEventListener('click', () => {
            document.getElementById('status-modal').style.display = 'none';
        });
        
        // Payment request modals
        document.getElementById('close-payment-request-modal').addEventListener('click', () => {
            document.getElementById('payment-request-modal').style.display = 'none';
        });
        
        document.getElementById('approve-request').addEventListener('click', () => {
            const modal = document.getElementById('payment-request-modal');
            const requestId = modal.dataset.requestId;
            this.approvePaymentRequest(requestId);
        });
        
        document.getElementById('reject-request').addEventListener('click', () => {
            const modal = document.getElementById('payment-request-modal');
            const requestId = modal.dataset.requestId;
            document.getElementById('reject-request-id').value = requestId;
            document.getElementById('reject-reason-modal').style.display = 'block';
        });
        
        document.getElementById('cancel-request-review').addEventListener('click', () => {
            document.getElementById('payment-request-modal').style.display = 'none';
        });
        
        document.getElementById('close-reject-reason-modal').addEventListener('click', () => {
            document.getElementById('reject-reason-modal').style.display = 'none';
        });
        
        document.getElementById('cancel-rejection').addEventListener('click', () => {
            document.getElementById('reject-reason-modal').style.display = 'none';
        });
        
        // Filter and refresh buttons
        document.getElementById('filter-requests').addEventListener('click', () => {
            this.loadPaymentRequests();
        });
        
        document.getElementById('refresh-requests').addEventListener('click', () => {
            this.loadPaymentRequests();
        });
        
        document.getElementById('reset-easypaisa-settings').addEventListener('click', () => {
            this.loadEasypaisaSettings();
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    }
    
    setupFormEvents() {
        // Balance adjustment form
        document.getElementById('balance-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.adjustUserBalance();
        });
        
        // Status change form
        document.getElementById('status-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.changeUserStatus();
        });
        
        // EasyPaisa settings form
        document.getElementById('easypaisa-settings-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                accountNumber: document.getElementById('admin-easypaisa-number').value,
                accountName: document.getElementById('admin-easypaisa-name').value,
                minDeposit: parseInt(document.getElementById('min-deposit').value),
                maxDeposit: parseInt(document.getElementById('max-deposit').value),
                minWithdrawal: parseInt(document.getElementById('min-withdrawal').value),
                maxWithdrawal: parseInt(document.getElementById('max-withdrawal').value),
                dailyLimit: parseInt(document.getElementById('daily-limit').value)
            };
            await this.saveEasypaisaSettings(formData);
        });
        
        // Reject reason form
        document.getElementById('reject-reason-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const requestId = document.getElementById('reject-request-id').value;
            const reason = document.getElementById('reject-reason').value;
            await this.rejectPaymentRequest(requestId, reason);
        });
    }
    
    setupSearchEvents() {
        // User search
        document.getElementById('search-users').addEventListener('click', () => {
            this.loadUsers(1, true);
        });
        
        document.getElementById('refresh-users').addEventListener('click', () => {
            this.loadUsers(1, false);
        });
        
        // Transaction search
        document.getElementById('search-transactions').addEventListener('click', () => {
            this.loadTransactions(1, true);
        });
        
        document.getElementById('refresh-transactions').addEventListener('click', () => {
            this.loadTransactions(1, false);
        });
        
        // Analytics generation
        document.getElementById('generate-analytics').addEventListener('click', () => {
            this.generateAnalytics();
        });
    }
    
    async makeRequest(url, method = 'GET', data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            const result = await response.json();
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    this.logout();
                    return null;
                }
                throw new Error(result.error || 'Request failed');
            }
            
            return result;
        } catch (error) {
            console.error('API Request failed:', error);
            this.showError(error.message);
            return null;
        }
    }
    
    switchSection(section) {
        // Update navigation
        document.querySelectorAll('.menu-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.add('hidden');
        });
        
        // Show target section
        document.getElementById(`${section}-section`).classList.remove('hidden');
        
        // Update header
        const titles = {
            dashboard: 'Dashboard',
            users: 'User Management',
            transactions: 'Transaction Management',
            analytics: 'Analytics',
            'payment-settings': 'EasyPaisa Settings',
            'payment-requests': 'Payment Requests',
            settings: 'System Settings',
            audit: 'Audit Log'
        };
        document.getElementById('section-title').textContent = titles[section];
        
        this.currentSection = section;
        this.currentPage = 1;
        
        // Load section data
        this.loadSectionData(section);
    }
    
    async loadSectionData(section) {
        switch (section) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'users':
                await this.loadUsers();
                break;
            case 'transactions':
                await this.loadTransactions();
                break;
            case 'payment-settings':
                await this.loadEasypaisaSettings();
                break;
            case 'payment-requests':
                await this.loadPaymentRequests();
                break;
            case 'settings':
                await this.loadSettings();
                break;
            case 'audit':
                await this.loadAuditLog();
                break;
        }
    }
    
    async loadDashboard() {
        // Set admin username from token or default
        try {
            if (this.authToken) {
                const payload = JSON.parse(atob(this.authToken.split('.')[1]));
                this.adminUsername = payload.username || 'Admin';
            }
        } catch (e) {
            this.adminUsername = 'Admin';
        }
        document.getElementById('admin-username').textContent = this.adminUsername;
        
        const dashboard = await this.makeRequest('/api/admin/dashboard');
        if (!dashboard) return;
        
        // Render statistics
        this.renderStats(dashboard.stats);
        
        // Render recent activity
        this.renderRecentActivity(dashboard.recentActions);
        
        // Render game stats
        this.renderGameStats(dashboard.gameStats);
    }
    
    renderStats(stats) {
        const statsGrid = document.getElementById('stats-grid');
        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>${stats.total_users || 0}</h3>
                <p>Total Users</p>
            </div>
            <div class="stat-card">
                <h3>${stats.new_users_today || 0}</h3>
                <p>New Users Today</p>
            </div>
            <div class="stat-card">
                <h3>${stats.transactions_today || 0}</h3>
                <p>Transactions Today</p>
            </div>
            <div class="stat-card">
                <h3>Rs ${(stats.total_user_balance || 0).toFixed(2)}</h3>
                <p>Total User Balance</p>
            </div>
            <div class="stat-card">
                <h3>Rs ${((stats.losses_today || 0) - (stats.winnings_today || 0)).toFixed(2)}</h3>
                <p>House Profit Today</p>
            </div>
            <div class="stat-card">
                <h3>${stats.active_sessions || 0}</h3>
                <p>Active Sessions</p>
            </div>
        `;
    }
    
    renderRecentActivity(actions) {
        const container = document.getElementById('recent-activity');
        if (!actions || actions.length === 0) {
            container.innerHTML = '<p>No recent activity.</p>';
            return;
        }
        
        const html = actions.map(action => `
            <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
                <strong>${action.admin_username}</strong> 
                performed <em>${action.action_type}</em>
                ${action.target_username ? `on user <strong>${action.target_username}</strong>` : ''}
                <small style="color: #666; display: block;">
                    ${new Date(action.timestamp).toLocaleString()}
                </small>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }
    
    renderGameStats(gameStats) {
        const container = document.getElementById('game-stats');
        if (!gameStats || gameStats.length === 0) {
            container.innerHTML = '<p>No game statistics available.</p>';
            return;
        }
        
        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Game</th>
                        <th>Plays</th>
                        <th>Total Winnings</th>
                        <th>Total Losses</th>
                        <th>House Edge</th>
                    </tr>
                </thead>
                <tbody>
                    ${gameStats.map(game => {
                        const profit = (game.total_losses || 0) - (game.total_winnings || 0);
                        const houseEdge = game.total_losses > 0 ? 
                            ((profit / game.total_losses) * 100).toFixed(2) : '0.00';
                        
                        return `
                            <tr>
                                <td>${game.game}</td>
                                <td>${game.play_count}</td>
                                <td>Rs ${(game.total_winnings || 0).toFixed(2)}</td>
                                <td>Rs ${(game.total_losses || 0).toFixed(2)}</td>
                                <td>${houseEdge}%</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
    }
    
    async loadUsers(page = 1, search = false) {
        const params = new URLSearchParams({
            page,
            limit: 20
        });
        
        if (search) {
            const searchTerm = document.getElementById('user-search').value;
            const sortBy = document.getElementById('user-sort').value;
            const sortOrder = document.getElementById('user-order').value;
            
            if (searchTerm) params.append('search', searchTerm);
            if (sortBy) params.append('sortBy', sortBy);
            if (sortOrder) params.append('sortOrder', sortOrder);
        }
        
        const data = await this.makeRequest(`/api/admin/users?${params}`);
        if (!data) return;
        
        this.renderUsersTable(data.users);
        this.renderPagination('users', data.pagination);
    }
    
    renderUsersTable(users) {
        const tbody = document.getElementById('users-table-body');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
            return;
        }
        
        const html = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>Rs ${parseFloat(user.balance || 0).toFixed(2)}</td>
                <td><span class="status-${user.account_status}">${user.account_status}</span></td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <button class="btn btn-primary" onclick="adminDashboard.viewUser(${user.id})">View</button>
                    <button class="btn btn-warning" onclick="adminDashboard.adjustBalance(${user.id})">Balance</button>
                    <button class="btn btn-secondary" onclick="adminDashboard.changeStatus(${user.id})">Status</button>
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = html;
    }
    
    async loadTransactions(page = 1, search = false) {
        const params = new URLSearchParams({
            page,
            limit: 50
        });
        
        if (search) {
            const userId = document.getElementById('transaction-user').value;
            const gameType = document.getElementById('transaction-game').value;
            const transactionType = document.getElementById('transaction-type').value;
            
            if (userId) params.append('userId', userId);
            if (gameType !== 'all') params.append('gameType', gameType);
            if (transactionType !== 'all') params.append('transactionType', transactionType);
        }
        
        const data = await this.makeRequest(`/api/admin/transactions?${params}`);
        if (!data) return;
        
        this.renderTransactionsTable(data.transactions);
        this.renderPagination('transactions', data.pagination);
    }
    
    renderTransactionsTable(transactions) {
        const tbody = document.getElementById('transactions-table-body');
        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No transactions found.</td></tr>';
            return;
        }
        
        const html = transactions.map(tx => `
            <tr>
                <td>${tx.id}</td>
                <td>${tx.username || 'Unknown'}</td>
                <td>${tx.type}</td>
                <td>Rs ${parseFloat(tx.amount || 0).toFixed(2)}</td>
                <td>${tx.game || 'N/A'}</td>
                <td>${new Date(tx.timestamp).toLocaleString()}</td>
                <td>
                    <button class="btn btn-primary" onclick="adminDashboard.viewTransactionDetails(${tx.id})">Details</button>
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = html;
    }
    
    async loadSettings() {
        const data = await this.makeRequest('/api/admin/settings');
        if (!data) return;
        
        this.renderSettings(data.settings);
    }
    
    renderSettings(settings) {
        const container = document.getElementById('settings-content');
        let html = '';
        
        Object.keys(settings).forEach(category => {
            html += `
                <div class="admin-section">
                    <div class="section-header">${category.replace('_', ' ').toUpperCase()}</div>
                    <div class="section-content">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Setting</th>
                                    <th>Current Value</th>
                                    <th>Description</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${settings[category].map(setting => `
                                    <tr>
                                        <td><strong>${setting.setting_key}</strong></td>
                                        <td>${setting.setting_value}</td>
                                        <td>${setting.description || 'No description'}</td>
                                        <td>
                                            <button class="btn btn-primary" onclick="adminDashboard.editSetting('${setting.setting_key}', '${setting.setting_value}')">
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    async loadAuditLog(page = 1) {
        const params = new URLSearchParams({
            page,
            limit: 50
        });
        
        const data = await this.makeRequest(`/api/admin/audit-log?${params}`);
        if (!data) return;
        
        this.renderAuditTable(data.auditLog);
        this.renderPagination('audit', { page, limit: 50, total: data.auditLog.length });
    }
    
    renderAuditTable(auditLog) {
        const tbody = document.getElementById('audit-table-body');
        if (!auditLog || auditLog.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No audit entries found.</td></tr>';
            return;
        }
        
        const html = auditLog.map(entry => `
            <tr>
                <td>${new Date(entry.timestamp).toLocaleString()}</td>
                <td>${entry.admin_username || 'Unknown'}</td>
                <td>${entry.action_type}</td>
                <td>${entry.target_username || 'N/A'}</td>
                <td>${entry.action_details}</td>
                <td>${entry.old_value || 'N/A'}</td>
                <td>${entry.new_value || 'N/A'}</td>
            </tr>
        `).join('');
        
        tbody.innerHTML = html;
    }
    
    renderPagination(section, pagination) {
        const container = document.getElementById(`${section}-pagination`);
        if (!pagination) return;
        
        const { page, pages, total } = pagination;
        let html = `<span>Page ${page} of ${pages} (${total} total)</span>`;
        
        if (page > 1) {
            html += `<button onclick="adminDashboard.loadPage('${section}', ${page - 1})">Previous</button>`;
        }
        
        if (page < pages) {
            html += `<button onclick="adminDashboard.loadPage('${section}', ${page + 1})">Next</button>`;
        }
        
        container.innerHTML = html;
    }
    
    loadPage(section, page) {
        this.currentPage = page;
        switch (section) {
            case 'users':
                this.loadUsers(page);
                break;
            case 'transactions':
                this.loadTransactions(page);
                break;
            case 'audit':
                this.loadAuditLog(page);
                break;
        }
    }
    
    async viewUser(userId) {
        const data = await this.makeRequest(`/api/admin/users/${userId}`);
        if (!data) return;
        
        const modal = document.getElementById('user-modal');
        const content = document.getElementById('user-modal-content');
        
        const html = `
            <div class="form-group">
                <label>User ID:</label>
                <p>${data.user.id}</p>
            </div>
            <div class="form-group">
                <label>Username:</label>
                <p>${data.user.username}</p>
            </div>
            <div class="form-group">
                <label>Balance:</label>
                <p>Rs ${parseFloat(data.user.balance || 0).toFixed(2)}</p>
            </div>
            <div class="form-group">
                <label>Status:</label>
                <p><span class="status-${data.user.account_status}">${data.user.account_status}</span></p>
            </div>
            <div class="form-group">
                <label>Total Deposits:</label>
                <p>Rs ${parseFloat(data.user.total_deposits || 0).toFixed(2)}</p>
            </div>
            <div class="form-group">
                <label>Total Withdrawals:</label>
                <p>Rs ${parseFloat(data.user.total_withdrawals || 0).toFixed(2)}</p>
            </div>
            <div class="form-group">
                <label>Join Date:</label>
                <p>${data.user.created_at ? new Date(data.user.created_at).toLocaleString() : 'N/A'}</p>
            </div>
            <div class="form-group">
                <label>Last Login:</label>
                <p>${data.user.last_login ? new Date(data.user.last_login).toLocaleString() : 'Never'}</p>
            </div>
            <div class="form-group">
                <label>Recent Transactions:</label>
                <table class="data-table">
                    <thead>
                        <tr><th>Type</th><th>Amount</th><th>Game</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                        ${data.recentTransactions.map(tx => `
                            <tr>
                                <td>${tx.type}</td>
                                <td>Rs ${parseFloat(tx.amount || 0).toFixed(2)}</td>
                                <td>${tx.game || 'N/A'}</td>
                                <td>${new Date(tx.timestamp).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        content.innerHTML = html;
        modal.style.display = 'block';
    }
    
    adjustBalance(userId) {
        document.getElementById('balance-user-id').value = userId;
        document.getElementById('balance-modal').style.display = 'block';
    }
    
    async adjustUserBalance() {
        const userId = document.getElementById('balance-user-id').value;
        const type = document.getElementById('balance-type').value;
        const amount = parseFloat(document.getElementById('balance-amount').value);
        const reason = document.getElementById('balance-reason').value;
        
        const result = await this.makeRequest(`/api/admin/users/${userId}/balance`, 'POST', {
            type, amount, reason
        });
        
        if (result) {
            this.showSuccess('Balance adjusted successfully');
            document.getElementById('balance-modal').style.display = 'none';
            this.loadUsers(this.currentPage);
            document.getElementById('balance-form').reset();
        }
    }
    
    changeStatus(userId) {
        document.getElementById('status-user-id').value = userId;
        document.getElementById('status-modal').style.display = 'block';
    }
    
    async changeUserStatus() {
        const userId = document.getElementById('status-user-id').value;
        const status = document.getElementById('user-status').value;
        const reason = document.getElementById('status-reason').value;
        
        const result = await this.makeRequest(`/api/admin/users/${userId}/status`, 'PUT', {
            status, reason
        });
        
        if (result) {
            this.showSuccess('User status updated successfully');
            document.getElementById('status-modal').style.display = 'none';
            this.loadUsers(this.currentPage);
            document.getElementById('status-form').reset();
        }
    }
    
    async generateAnalytics() {
        const startDate = document.getElementById('analytics-start-date').value;
        const endDate = document.getElementById('analytics-end-date').value;
        const gameType = document.getElementById('analytics-game').value;
        
        if (!startDate || !endDate) {
            this.showError('Please select both start and end dates');
            return;
        }
        
        const params = new URLSearchParams({
            startDate, endDate
        });
        
        if (gameType !== 'all') {
            params.append('gameType', gameType);
        }
        
        const data = await this.makeRequest(`/api/admin/analytics/transactions?${params}`);
        if (!data) return;
        
        this.renderAnalytics(data.analytics);
    }
    
    renderAnalytics(analytics) {
        const container = document.getElementById('analytics-results');
        
        if (!analytics || analytics.length === 0) {
            container.innerHTML = '<p>No data found for the selected date range.</p>';
            return;
        }
        
        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Game</th>
                        <th>Transactions</th>
                        <th>Total Winnings</th>
                        <th>Total Losses</th>
                        <th>House Profit</th>
                    </tr>
                </thead>
                <tbody>
                    ${analytics.map(row => {
                        const profit = (row.total_losses || 0) - (row.total_winnings || 0);
                        return `
                            <tr>
                                <td>${row.date}</td>
                                <td>${row.game}</td>
                                <td>${row.transaction_count}</td>
                                <td>Rs ${(row.total_winnings || 0).toFixed(2)}</td>
                                <td>Rs ${(row.total_losses || 0).toFixed(2)}</td>
                                <td>Rs ${profit.toFixed(2)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
    }
    
    async editSetting(key, currentValue) {
        const newValue = prompt(`Edit ${key}:`, currentValue);
        if (newValue === null || newValue === currentValue) return;
        
        const reason = prompt('Reason for change:');
        if (!reason) return;
        
        const result = await this.makeRequest(`/api/admin/settings/${key}`, 'PUT', {
            value: newValue, reason
        });
        
        if (result) {
            this.showSuccess('Setting updated successfully');
            this.loadSettings();
        }
    }
    
    viewTransactionDetails(transactionId) {
        alert(`Transaction details for ID: ${transactionId} - Feature coming soon!`);
    }
    
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        document.body.insertBefore(errorDiv, document.body.firstChild);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
    
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success';
        successDiv.textContent = message;
        document.body.insertBefore(successDiv, document.body.firstChild);
        
        setTimeout(() => {
            successDiv.remove();
        }, 5000);
    }
    
    async loadEasypaisaSettings() {
        try {
            const response = await this.makeRequest('/api/payment/easypaisa-info');
            if (response) {
                document.getElementById('admin-easypaisa-number').value = response.accountNumber || '';
                document.getElementById('admin-easypaisa-name').value = response.accountName || '';
                document.getElementById('min-deposit').value = response.minDeposit || 100;
                document.getElementById('max-deposit').value = response.maxDeposit || 50000;
                document.getElementById('min-withdrawal').value = response.minWithdrawal || 200;
                document.getElementById('max-withdrawal').value = response.maxWithdrawal || 25000;
                document.getElementById('daily-limit').value = response.dailyLimit || 100000;
            }
        } catch (error) {
            this.showError('Failed to load EasyPaisa settings');
        }
    }

    async loadPaymentRequests() {
        try {
            const response = await this.makeRequest('/api/admin/requests');
            if (response) {
                this.displayPaymentRequests(response.requests);
            }
        } catch (error) {
            this.showError('Failed to load payment requests');
        }
    }

    displayPaymentRequests(requests) {
        const tbody = document.getElementById('payment-requests-table-body');
        
        if (!requests || requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No payment requests found</td></tr>';
            return;
        }

        tbody.innerHTML = requests.map(request => {
            const statusClass = request.status === 'pending' ? 'status-pending' : 
                              request.status === 'approved' ? 'status-approved' : 'status-rejected';
            
            return `
                <tr>
                    <td>#${request.id}</td>
                    <td>${request.username} (#${request.user_id})</td>
                    <td>${request.request_type}</td>
                    <td>Rs.${request.amount}</td>
                    <td>${request.user_easypaisa_number}<br><small>${request.user_easypaisa_name}</small></td>
                    <td><span class="status ${statusClass}">${request.status}</span></td>
                    <td>${new Date(request.created_at).toLocaleString()}</td>
                    <td>
                        ${request.status === 'pending' ? 
                            `<button class="btn btn-sm btn-primary" onclick="adminDashboard.reviewPaymentRequest(${request.id})">Review</button>` :
                            `<button class="btn btn-sm btn-secondary" onclick="adminDashboard.viewPaymentRequest(${request.id})">View</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    async reviewPaymentRequest(requestId) {
        try {
            const response = await this.makeRequest(`/api/admin/requests/${requestId}`);
            if (response) {
                this.showPaymentRequestModal(response);
            }
        } catch (error) {
            this.showError('Failed to load request details');
        }
    }

    async viewPaymentRequest(requestId) {
        try {
            const response = await this.makeRequest(`/api/admin/requests/${requestId}`);
            if (response) {
                this.showPaymentRequestModal(response, true); // true = view only mode
            }
        } catch (error) {
            this.showError('Failed to load request details');
        }
    }

    showPaymentRequestModal(request, viewOnly = false) {
        const modal = document.getElementById('payment-request-modal');
        const details = document.getElementById('payment-request-details');
        
        details.innerHTML = `
            <div class="request-details">
                <div class="detail-group">
                    <label>Request ID:</label>
                    <span>#${request.id}</span>
                </div>
                <div class="detail-group">
                    <label>User:</label>
                    <span>${request.username} (#${request.user_id})</span>
                </div>
                <div class="detail-group">
                    <label>Type:</label>
                    <span>${request.request_type}</span>
                </div>
                <div class="detail-group">
                    <label>Amount:</label>
                    <span>Rs.${request.amount}</span>
                </div>
                <div class="detail-group">
                    <label>User EasyPaisa Number:</label>
                    <span>${request.user_easypaisa_number}</span>
                </div>
                <div class="detail-group">
                    <label>User EasyPaisa Name:</label>
                    <span>${request.user_easypaisa_name}</span>
                </div>
                <div class="detail-group">
                    <label>Request Date:</label>
                    <span>${new Date(request.created_at).toLocaleString()}</span>
                </div>
                ${request.request_type === 'deposit' ? `
                <div class="detail-group">
                    <label>Admin Account:</label>
                    <span>${request.admin_easypaisa_number} (${request.admin_easypaisa_name})</span>
                </div>
                ` : ''}
            </div>
        `;
        
        // Store request ID for approval/rejection
        modal.dataset.requestId = request.id;
        
        // Hide/show action buttons based on view mode and status
        const approveBtn = document.getElementById('approve-request');
        const rejectBtn = document.getElementById('reject-request');
        
        if (viewOnly || request.status !== 'pending') {
            approveBtn.style.display = 'none';
            rejectBtn.style.display = 'none';
        } else {
            approveBtn.style.display = 'inline-block';
            rejectBtn.style.display = 'inline-block';
        }
        
        modal.style.display = 'block';
    }

    async approvePaymentRequest(requestId) {
        try {
            const response = await this.makeRequest(`/api/admin/requests/${requestId}`, 'POST', {
                action: 'approve'
            });
            
            if (response) {
                this.showSuccess('Request approved successfully');
                document.getElementById('payment-request-modal').style.display = 'none';
                await this.loadPaymentRequests();
            }
        } catch (error) {
            this.showError('Failed to approve request');
        }
    }

    async rejectPaymentRequest(requestId, reason) {
        try {
            const response = await this.makeRequest(`/api/admin/requests/${requestId}`, 'POST', {
                action: 'reject',
                adminNotes: reason
            });
            
            if (response) {
                this.showSuccess('Request rejected successfully');
                document.getElementById('reject-reason-modal').style.display = 'none';
                document.getElementById('payment-request-modal').style.display = 'none';
                await this.loadPaymentRequests();
            }
        } catch (error) {
            this.showError('Failed to reject request');
        }
    }

    async saveEasypaisaSettings(formData) {
        try {
            const response = await this.makeRequest('/api/admin/settings/easypaisa', 'POST', formData);
            
            if (response) {
                this.showSuccess('EasyPaisa settings saved successfully');
            }
        } catch (error) {
            this.showError('Failed to save EasyPaisa settings');
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        window.location.href = '/';
    }
}

// Initialize admin dashboard when page loads
let adminDashboard;
document.addEventListener('DOMContentLoaded', () => {
    adminDashboard = new AdminDashboard();
});
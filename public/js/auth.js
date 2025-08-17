// Handle tab switching
const tabs = document.querySelectorAll('.tab');
const forms = document.querySelectorAll('.form-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetForm = tab.dataset.tab;
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show/hide forms
        forms.forEach(form => {
            form.classList.add('hidden');
            if (form.id === `${targetForm}Form`) {
                form.classList.remove('hidden');
            }
        });
    });
});

// Handle login form submission
const loginForm = document.getElementById('loginForm');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = loginForm.querySelector('input[type="text"]').value;
    const password = loginForm.querySelector('input[type="password"]').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            
            // Redirect based on role
            if (data.role === 'admin') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/dashboard.html';
            }
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('An error occurred. Please try again.');
    }
});

// Handle register form submission
const registerForm = document.getElementById('registerForm');
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const inputs = registerForm.querySelectorAll('input[type="password"]');
    if (inputs[0].value !== inputs[1].value) {
        alert('Passwords do not match!');
        return;
    }
    
    const username = registerForm.querySelector('input[type="text"]').value;
    const password = inputs[0].value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Registration successful! Please login.');
            // Switch to login tab
            document.querySelector('[data-tab="login"]').click();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('An error occurred. Please try again.');
    }
});

// Check if already logged in
window.addEventListener('load', () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    
    if (token) {
        if (role === 'admin') {
            window.location.href = '/admin.html';
        } else {
            window.location.href = '/dashboard.html';
        }
    }
});

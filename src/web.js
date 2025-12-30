const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const ptero = require('./ptero');
const { User, initDb } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: 'secret-key-change-this',
    resave: false,
    saveUninitialized: true
}));

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

async function isAdmin(req, res, next) {
    if (!req.session.userId) return res.redirect('/login');
    const user = await User.findByPk(req.session.userId);
    if (user && user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Access denied');
    }
}

app.use(async (req, res, next) => {
    if (req.session.userId) {
        res.locals.user = await User.findByPk(req.session.userId);
    } else {
        res.locals.user = null;
    }
    next();
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: 'Invalid credentials' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
    const currentUser = await User.findByPk(req.session.userId);
    let allServers = [];

    if (currentUser.role === 'admin') {
        const users = await User.findAll();
        for (const user of users) {
            if (user.ptero_url && user.ptero_api_key) {
                const servers = await ptero.getServers(user.ptero_url, user.ptero_api_key);
                const serversWithState = await Promise.all(servers.map(async (server) => {
                    const state = await ptero.getServerState(user.ptero_url, user.ptero_api_key, server.id);
                    return { ...server, state, owner: user.username, ownerId: user.id };
                }));
                allServers = allServers.concat(serversWithState);
            }
        }
    } else {
        if (currentUser.ptero_url && currentUser.ptero_api_key) {
            const servers = await ptero.getServers(currentUser.ptero_url, currentUser.ptero_api_key);
            const serversWithState = await Promise.all(servers.map(async (server) => {
                const state = await ptero.getServerState(currentUser.ptero_url, currentUser.ptero_api_key, server.id);
                return { ...server, state, owner: currentUser.username, ownerId: currentUser.id };
            }));
            allServers = serversWithState;
        }
    }
    
    res.render('dashboard', { servers: allServers, user: currentUser });
});

app.post('/api/server/:id/power', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { signal, ownerId } = req.body;
    
    const currentUser = await User.findByPk(req.session.userId);
    let targetUser = currentUser;
    
    if (ownerId) {
        if (currentUser.role === 'admin') {
            targetUser = await User.findByPk(ownerId);
        } else if (parseInt(ownerId) !== currentUser.id) {
             return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
    }

    if (!targetUser || !targetUser.ptero_url || !targetUser.ptero_api_key) {
        return res.status(400).json({ success: false, message: 'No API credentials' });
    }

    const success = await ptero.setPowerState(targetUser.ptero_url, targetUser.ptero_api_key, id, signal);
    res.json({ success });
});

app.get('/profile', isAuthenticated, async (req, res) => {
    const user = await User.findByPk(req.session.userId);
    res.render('profile', { user, error: null, success: null });
});

app.post('/profile', isAuthenticated, async (req, res) => {
    const { ptero_url, ptero_api_key } = req.body;
    await User.update({ ptero_url, ptero_api_key }, { where: { id: req.session.userId } });
    const user = await User.findByPk(req.session.userId);
    res.render('profile', { user, error: null, success: 'Profile updated successfully.' });
});

app.post('/profile/password', isAuthenticated, async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    const user = await User.findByPk(req.session.userId);

    if (!await bcrypt.compare(current_password, user.password)) {
        return res.render('profile', { user, error: 'Incorrect current password.', success: null });
    }

    if (new_password !== confirm_password) {
        return res.render('profile', { user, error: 'New passwords do not match.', success: null });
    }

    if (new_password.length < 6) {
        return res.render('profile', { user, error: 'Password must be at least 6 characters long.', success: null });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await User.update({ password: hashedPassword }, { where: { id: user.id } });

    res.render('profile', { user, error: null, success: 'Password changed successfully.' });
});

app.get('/admin/users', isAdmin, async (req, res) => {
    const users = await User.findAll();
    res.render('admin_users', { users });
});

app.post('/admin/users', isAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, role });
        res.redirect('/admin/users');
    } catch (error) {
        res.status(400).send('Error creating user: ' + error.message);
    }
});

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

async function startWeb() {
    await initDb();
    app.listen(PORT, () => {
        console.log(`Web manager running on http://localhost:${PORT}`);
    });
}

module.exports = { startWeb };

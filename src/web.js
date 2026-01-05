const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const axios = require('axios');
const ptero = require('./ptero');
const { User, BannedIp, LoginAttempt, ActionLog, initDb } = require('./db');
const { Op } = require('sequelize');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TURNSTILE_SECRET_KEY = '0x4AAAAAACJuDF9QLsB0-rvwHI4qcXTqKXk';
const TURNSTILE_CLIENT_KEY = '0x4AAAAAACJuDPFJ7Iwgvyqx';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Trust proxy to get real IP if behind reverse proxy (like nginx/cloudflare)
app.set('trust proxy', true);

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
    res.locals.path = req.path;
    if (req.session.userId) {
        res.locals.user = await User.findByPk(req.session.userId);
    } else {
        res.locals.user = null;
    }
    next();
});

app.get('/login', (req, res) => {
    res.render('login', { error: null, turnstileKey: TURNSTILE_CLIENT_KEY });
});

app.post('/login', async (req, res) => {
    const { username, password, 'cf-turnstile-response': turnstileToken } = req.body;
    const ip = req.ip;

    // Check if IP is banned
    const banned = await BannedIp.findOne({
        where: {
            ip: ip,
            [Op.or]: [
                { expiresAt: null },
                { expiresAt: { [Op.gt]: new Date() } }
            ]
        }
    });

    if (banned) {
        return res.render('login', { error: `Your IP is banned. Reason: ${banned.reason}`, turnstileKey: TURNSTILE_CLIENT_KEY });
    }

    // Verify Turnstile
    if (!turnstileToken) {
        return res.render('login', { error: 'Please complete the captcha.', turnstileKey: TURNSTILE_CLIENT_KEY });
    }

    try {
        const verifyRes = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            secret: TURNSTILE_SECRET_KEY,
            response: turnstileToken,
            remoteip: ip
        });

        if (!verifyRes.data.success) {
            return res.render('login', { error: 'Captcha verification failed.', turnstileKey: TURNSTILE_CLIENT_KEY });
        }
    } catch (err) {
        console.error('Turnstile verification error:', err);
        return res.render('login', { error: 'Captcha verification error.', turnstileKey: TURNSTILE_CLIENT_KEY });
    }

    const user = await User.findOne({ where: { username } });
    
    if (user && await bcrypt.compare(password, user.password)) {
        // Clear login attempts on success
        await LoginAttempt.destroy({ where: { ip } });
        
        // Log successful login
        await ActionLog.create({
            username: user.username,
            ip: ip,
            action: 'login',
            details: 'Successful login'
        });

        req.session.userId = user.id;
        res.redirect('/dashboard');
    } else {
        // Handle failed attempt
        let attempt = await LoginAttempt.findOne({ where: { ip } });
        if (!attempt) {
            attempt = await LoginAttempt.create({ ip, attempts: 1 });
        } else {
            attempt.attempts += 1;
            attempt.lastAttempt = new Date();
            await attempt.save();
        }

        if (attempt.attempts > 2) {
            // Ban IP for 24 hours
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            await BannedIp.create({
                ip: ip,
                reason: 'Too many failed login attempts',
                expiresAt: expiresAt
            });
            // Reset attempts
            await attempt.destroy();
            return res.render('login', { error: 'Too many failed attempts. Your IP has been banned for 24 hours.', turnstileKey: TURNSTILE_CLIENT_KEY });
        }

        res.render('login', { error: 'Invalid credentials', turnstileKey: TURNSTILE_CLIENT_KEY });
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
    
    // Log server operation
    await ActionLog.create({
        username: currentUser.username,
        ip: req.ip,
        action: 'server_power',
        details: `Server ID: ${id}, Signal: ${signal}, Success: ${success}`
    });

    res.json({ success });
});

app.get('/api/servers/status', isAuthenticated, async (req, res) => {
    const currentUser = await User.findByPk(req.session.userId);
    let allServers = [];

    if (currentUser.role === 'admin') {
        const users = await User.findAll();
        for (const user of users) {
            if (user.ptero_url && user.ptero_api_key) {
                const servers = await ptero.getServers(user.ptero_url, user.ptero_api_key);
                const serversWithState = await Promise.all(servers.map(async (server) => {
                    const state = await ptero.getServerState(user.ptero_url, user.ptero_api_key, server.id);
                    return { id: server.id, state };
                }));
                allServers = allServers.concat(serversWithState);
            }
        }
    } else {
        if (currentUser.ptero_url && currentUser.ptero_api_key) {
            const servers = await ptero.getServers(currentUser.ptero_url, currentUser.ptero_api_key);
            const serversWithState = await Promise.all(servers.map(async (server) => {
                const state = await ptero.getServerState(currentUser.ptero_url, currentUser.ptero_api_key, server.id);
                return { id: server.id, state };
            }));
            allServers = serversWithState;
        }
    }
    res.json(allServers);
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

app.get('/admin/logs', isAdmin, async (req, res) => {
    const logs = await ActionLog.findAll({
        order: [['timestamp', 'DESC']],
        limit: 100
    });
    res.render('admin_logs', { logs });
});

app.get('/admin/bans', isAdmin, async (req, res) => {
    const bans = await BannedIp.findAll();
    res.render('admin_bans', { bans });
});

app.post('/admin/bans', isAdmin, async (req, res) => {
    const { ip, reason } = req.body;
    try {
        await BannedIp.create({ ip, reason });
        res.redirect('/admin/bans');
    } catch (error) {
        res.status(400).send('Error banning IP: ' + error.message);
    }
});

app.post('/admin/bans/delete', isAdmin, async (req, res) => {
    const { id } = req.body;
    await BannedIp.destroy({ where: { id } });
    res.redirect('/admin/bans');
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

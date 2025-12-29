const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const ptero = require('./ptero');
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
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.user = username;
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
    const servers = await ptero.getServers();
    // Fetch state for each server
    const serversWithState = await Promise.all(servers.map(async (server) => {
        const state = await ptero.getServerState(server.id);
        return { ...server, state };
    }));
    
    res.render('dashboard', { servers: serversWithState, user: req.session.user });
});

app.post('/api/server/:id/power', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { signal } = req.body;
    
    const success = await ptero.setPowerState(id, signal);
    res.json({ success });
});

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

function startWeb() {
    app.listen(PORT, () => {
        console.log(`Web manager running on http://localhost:${PORT}`);
    });
}

module.exports = { startWeb };

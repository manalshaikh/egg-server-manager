const { Sequelize } = require('sequelize');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../database.sqlite'),
    logging: false
});

const User = require('./models/User')(sequelize);
const BannedIp = require('./models/BannedIp')(sequelize);
const LoginAttempt = require('./models/LoginAttempt')(sequelize);
const ActionLog = require('./models/ActionLog')(sequelize);

async function initDb() {
    // alter: true updates the schema to match the models without losing data
    await sequelize.sync({ alter: true });
    
    // Check if admin exists
    const admin = await User.findOne({ where: { username: process.env.ADMIN_USERNAME || 'admin' } });
    if (!admin) {
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'password123', 10);
        await User.create({
            username: process.env.ADMIN_USERNAME || 'admin',
            password: hashedPassword,
            role: 'admin',
            ptero_url: process.env.PTERO_PANEL_URL,
            ptero_api_key: process.env.PTERO_API_KEY
        });
        console.log('Admin user created');
    }
}

module.exports = { sequelize, User, BannedIp, LoginAttempt, ActionLog, initDb };

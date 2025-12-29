const { startBot } = require('./src/bot');
const { startWeb } = require('./src/web');

console.log('Starting Egg Server Manager...');

// Start Discord Bot
startBot();

// Start Web Manager
startWeb();

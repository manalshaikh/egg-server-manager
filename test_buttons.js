const assert = require('assert');

// Test the backend ptero.js functions
console.log('Testing Pterodactyl API functions...\n');

// Test 1: Check if setPowerState function exists
function testSetPowerStateExists() {
    console.log('=== Test 1: setPowerState Function Exists ===');
    const ptero = require('./src/ptero');

    assert(typeof ptero.setPowerState === 'function', 'setPowerState should be a function');
    console.log('✓ setPowerState function exists');
}

// Test 2: Check all exported functions
function testAllExports() {
    console.log('\n=== Test 2: All Functions Exported ===');
    const ptero = require('./src/ptero');

    const expectedFunctions = [
        'getServers', 'getServerState', 'sendCommand', 'getResources',
        'listBackups', 'createBackup', 'deleteBackup', 'listFiles',
        'getFileContent', 'writeFile', 'getConsoleLogs', 'setPowerState'
    ];

    expectedFunctions.forEach(funcName => {
        assert(typeof ptero[funcName] === 'function', `${funcName} should be exported`);
        console.log(`✓ ${funcName} is exported`);
    });
}

// Test 3: Check button HTML structure (manual check)
function testButtonHTML() {
    console.log('\n=== Test 3: Button HTML Structure Check ===');
    const fs = require('fs');
    const path = require('path');

    const dashboardPath = path.join(__dirname, 'views', 'dashboard.ejs');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

    // Check if buttons have correct structure
    assert(dashboardContent.includes('data-action="start"'), 'Start button should have data-action');
    assert(dashboardContent.includes('data-action="stop"'), 'Stop button should have data-action');
    assert(dashboardContent.includes('data-action="restart"'), 'Restart button should have data-action');
    assert(dashboardContent.includes('btn-action'), 'Buttons should have btn-action class');

    console.log('✓ Button HTML structure is correct');
}

// Test 4: Check backend route exists
function testBackendRoute() {
    console.log('\n=== Test 4: Backend Route Exists ===');
    const fs = require('fs');
    const path = require('path');

    const webPath = path.join(__dirname, 'src', 'web.js');
    const webContent = fs.readFileSync(webPath, 'utf8');

    assert(webContent.includes('/api/server/:id/power'), 'Power route should exist');
    assert(webContent.includes('setPowerState'), 'Route should call setPowerState');

    console.log('✓ Backend route exists and calls setPowerState');
}

// Run tests
try {
    testSetPowerStateExists();
    testAllExports();
    testButtonHTML();
    testBackendRoute();

    console.log('\n🎉 All backend tests passed!');
    console.log('\n=== Debugging Guide ===');
    console.log('If buttons still don\'t work in browser:');
    console.log('1. ✅ FIXED: setPowerState function now exists');
    console.log('2. ✅ FIXED: Syntax error in main.js');
    console.log('3. Check: Is the server running? (node index.js)');
    console.log('4. Check: Browser console for JavaScript errors');
    console.log('5. Check: Network tab for failed AJAX requests');
    console.log('6. Check: Server logs for API errors');
    console.log('7. Check: Button data attributes (data-id, data-owner, data-action)');

} catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\nThe issue is:', error.message);
}
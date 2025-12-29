const axios = require('axios');
require('dotenv').config();

const PANEL_URL = process.env.PTERO_PANEL_URL;
const API_KEY = process.env.PTERO_API_KEY;

const api = axios.create({
    baseURL: `${PANEL_URL}/api/client`,
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
});

async function getServers() {
    try {
        const response = await api.get('/');
        return response.data.data.map(server => ({
            id: server.attributes.identifier,
            name: server.attributes.name,
            node: server.attributes.node,
            status: server.attributes.status || 'unknown', // status is often null if not performing an action
            limits: server.attributes.limits,
            uuid: server.attributes.uuid
        }));
    } catch (error) {
        console.error('Error fetching servers:', error.message);
        return [];
    }
}

async function getServerState(serverId) {
    try {
        const response = await api.get(`/servers/${serverId}/resources`);
        return response.data.attributes.current_state;
    } catch (error) {
        console.error(`Error fetching state for ${serverId}:`, error.message);
        return 'unknown';
    }
}

async function setPowerState(serverId, signal) {
    try {
        // signal: 'start', 'stop', 'restart', 'kill'
        await api.post(`/servers/${serverId}/power`, { signal });
        return true;
    } catch (error) {
        console.error(`Error setting power state for ${serverId}:`, error.message);
        return false;
    }
}

module.exports = {
    getServers,
    getServerState,
    setPowerState
};

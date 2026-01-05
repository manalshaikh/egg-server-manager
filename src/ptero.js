const axios = require('axios');

function getClient(url, key) {
    if (!url || !key) return null;
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    return axios.create({
        baseURL: `${baseUrl}/api/client`,
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    });
}

async function getServers(url, key) {
    const api = getClient(url, key);
    if (!api) return [];
    
    try {
        const response = await api.get('/?include=allocations');
        return response.data.data.map(server => {
            let ip = 'Unknown';
            let port = '';
            if (server.attributes.relationships && server.attributes.relationships.allocations) {
                const defaultAllocation = server.attributes.relationships.allocations.data.find(a => a.attributes.is_default) || server.attributes.relationships.allocations.data[0];
                if (defaultAllocation) {
                    ip = defaultAllocation.attributes.ip;
                    port = defaultAllocation.attributes.port;
                }
            }
            
            // If IP is an alias (like 0.0.0.0), we might want to use the node's FQDN if available, but client API doesn't always give node IP easily without extra calls.
            // However, usually the allocation IP is what we want.
            if (server.attributes.sftp_details && server.attributes.sftp_details.ip) {
                 // Fallback or alternative if allocation is weird, but allocation is usually correct for game connection.
            }

            return {
                id: server.attributes.identifier,
                name: server.attributes.name,
                node: server.attributes.node,
                status: server.attributes.status || 'unknown',
                limits: server.attributes.limits,
                uuid: server.attributes.uuid,
                ip: ip,
                port: port
            };
        });
    } catch (error) {
        console.error(`Error fetching servers from ${url}:`, error.message);
        return [];
    }
}

async function getServerState(url, key, serverId) {
    const api = getClient(url, key);
    if (!api) return 'unknown';

    try {
        const response = await api.get(`/servers/${serverId}/resources`);
        return response.data.attributes.current_state;
    } catch (error) {
        console.error(`Error fetching state for ${serverId}:`, error.message);
        return 'unknown';
    }
}

async function setPowerState(url, key, serverId, signal) {
    const api = getClient(url, key);
    if (!api) return false;

    try {
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

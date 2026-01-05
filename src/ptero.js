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

function getApplicationClient(url, key) {
    if (!url || !key) return null;
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    return axios.create({
        baseURL: `${baseUrl}/api/application`,
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

async function sendCommand(url, key, serverId, command) {
    const api = getClient(url, key);
    if (!api) return false;

    try {
        await api.post(`/servers/${serverId}/command`, { command });
        return true;
    } catch (error) {
        console.error(`Error sending command to ${serverId}:`, error.message);
        return false;
    }
}

async function getConsoleLogs(url, key, serverId) {
    const api = getClient(url, key);
    if (!api) return null;

    try {
        const response = await api.get(`/servers/${serverId}/websocket`);
        return response.data;
    } catch (error) {
        console.error(`Error getting console logs for ${serverId}:`, error.message);
        return null;
    }
}

async function listBackups(url, key, serverId) {
    const api = getClient(url, key);
    if (!api) return [];

    try {
        const response = await api.get(`/servers/${serverId}/backups`);
        return response.data.data.map(backup => ({
            uuid: backup.attributes.uuid,
            name: backup.attributes.name,
            size: backup.attributes.size,
            created_at: backup.attributes.created_at,
            completed_at: backup.attributes.completed_at,
            status: backup.attributes.status
        }));
    } catch (error) {
        console.error(`Error listing backups for ${serverId}:`, error.message);
        return [];
    }
}

async function createBackup(url, key, serverId, name) {
    const api = getClient(url, key);
    if (!api) return false;

    try {
        await api.post(`/servers/${serverId}/backups`, { name });
        return true;
    } catch (error) {
        console.error(`Error creating backup for ${serverId}:`, error.message);
        return false;
    }
}

async function deleteBackup(url, key, serverId, backupUuid) {
    const api = getClient(url, key);
    if (!api) return false;

    try {
        await api.delete(`/servers/${serverId}/backups/${backupUuid}`);
        return true;
    } catch (error) {
        console.error(`Error deleting backup ${backupUuid} for ${serverId}:`, error.message);
        return false;
    }
}

async function listFiles(url, key, serverId, directory = '/') {
    const api = getClient(url, key);
    if (!api) return [];

    try {
        const response = await api.get(`/servers/${serverId}/files/list?directory=${encodeURIComponent(directory)}`);
        return response.data.data.map(file => ({
            name: file.attributes.name,
            mode: file.attributes.mode,
            size: file.attributes.size,
            type: file.attributes.is_file ? 'file' : 'directory',
            is_file: file.attributes.is_file,
            is_symlink: file.attributes.is_symlink,
            mimetype: file.attributes.mimetype,
            created_at: file.attributes.created_at,
            modified_at: file.attributes.modified_at
        }));
    } catch (error) {
        console.error(`Error listing files for ${serverId}:`, error.message);
        return [];
    }
}

async function getFileContent(url, key, serverId, file) {
    const api = getClient(url, key);
    if (!api) return null;

    try {
        const response = await api.get(`/servers/${serverId}/files/contents?file=${encodeURIComponent(file)}`);
        return response.data;
    } catch (error) {
        console.error(`Error getting file content for ${serverId}/${file}:`, error.message);
        return null;
    }
}

async function writeFile(url, key, serverId, file, content) {
    const api = getClient(url, key);
    if (!api) return false;

    try {
        await api.post(`/servers/${serverId}/files/write?file=${encodeURIComponent(file)}`, content, {
            headers: { 'Content-Type': 'text/plain' }
        });
        return true;
    } catch (error) {
        console.error(`Error writing file for ${serverId}/${file}:`, error.message);
        return false;
    }
}

async function setPowerState(url, key, serverId, signal) {
    const api = getClient(url, key);
    if (!api) return false;

    try {
        await api.post(`/servers/${serverId}/power`, { signal: signal });
        return true;
    } catch (error) {
        console.error(`Error setting power state for ${serverId} to ${signal}:`, error.message);
        return false;
    }
}

module.exports = {
    getServers,
    getServerState,
    sendCommand,
    listBackups,
    createBackup,
    deleteBackup,
    listFiles,
    getFileContent,
    writeFile,
    setPowerState,
    getConsoleLogs
};

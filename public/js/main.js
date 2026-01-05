$(document).ready(function() {
    // Poll for server status every 10 seconds
    setInterval(updateServerStatus, 10000);

    function updateServerStatus() {
        $.ajax({
            url: '/api/servers/status',
            method: 'GET',
            success: function(servers) {
                servers.forEach(server => {
                    const card = $(`.server-card[data-id="${server.id}"]`);
                    if (card.length) {
                        const statusBadge = card.find('.server-status');
                        const currentStatus = statusBadge.text().trim();
                        
                        if (currentStatus !== server.state) {
                            statusBadge.text(server.state);
                            statusBadge.removeClass('bg-success bg-danger bg-warning bg-info');
                            
                            if (server.state === 'running') statusBadge.addClass('bg-success');
                            else if (server.state === 'offline') statusBadge.addClass('bg-danger');
                            else if (server.state === 'starting') statusBadge.addClass('bg-warning');
                            else statusBadge.addClass('bg-info');

                            // Update buttons
                            const startBtn = card.find('[data-action="start"]');
                            const stopBtn = card.find('[data-action="stop"]');
                            
                            if (server.state === 'running') {
                                startBtn.prop('disabled', true);
                                stopBtn.prop('disabled', false);
                            } else if (server.state === 'offline') {
                                startBtn.prop('disabled', false);
                                stopBtn.prop('disabled', true);
                            } else {
                                startBtn.prop('disabled', false);
                                stopBtn.prop('disabled', false);
                            }
                        }
                    }
                });
            }
        });
    }

    $('.btn-action').click(function() {
        const btn = $(this);
        const card = btn.closest('.server-card');
        const serverId = card.data('id');
        const ownerId = card.data('owner');
        const action = btn.data('action');
        
        // Disable buttons while processing
        card.find('.btn-action').prop('disabled', true);
        
        // Show loading state on button
        const originalHtml = btn.html();
        btn.html('<i class="fas fa-spinner fa-spin"></i> Processing...');

        $.ajax({
            url: `/api/server/${serverId}/power`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ signal: action, ownerId: ownerId }),
            success: function(response) {
                if (response.success) {
                    // Wait a bit then update status manually or let poller handle it
                    setTimeout(() => {
                        updateServerStatus();
                        // Reset button state (it will be updated by poller anyway, but good to reset text)
                        btn.html(originalHtml);
                    }, 2000); 
                } else {
                    alert('Failed to perform action.');
                    card.find('.btn-action').prop('disabled', false);
                    btn.html(originalHtml);
                }
            },
            error: function() {
                alert('Error communicating with server.');
                card.find('.btn-action').prop('disabled', false);
                btn.html(originalHtml);
            }
        });
    });

    $('#consoleModal').on('show.bs.modal', function (event) {
        const button = $(event.relatedTarget);
        const serverId = button.data('server-id');
        const ownerId = button.data('owner-id');
        
        const modal = $(this);
        modal.data('server-id', serverId);
        modal.data('owner-id', ownerId);
        
        loadLogs(serverId, ownerId);
    });

    $('#consoleModal').on('hide.bs.modal', function () {
        // Clean up websocket connection
        const logsContainer = $('#logsContainer');
        const ws = logsContainer.data('websocket');
        if (ws) {
            console.log('Closing websocket connection');
            ws.close();
            logsContainer.removeData('websocket');
        }
    });

    $('#refreshLogsBtn').click(function() {
        const modal = $('#consoleModal');
        const serverId = modal.data('server-id');
        const ownerId = modal.data('owner-id');
        
        // Close existing connection
        const logsContainer = $('#logsContainer');
        const ws = logsContainer.data('websocket');
        if (ws) {
            ws.close();
            logsContainer.removeData('websocket');
        }
        
        loadLogs(serverId, ownerId);
    });

    function loadLogs(serverId, ownerId) {
        const logsContainer = $('#logsContainer');
        logsContainer.html('<div class="text-center text-muted"><i class="fas fa-spinner fa-spin me-2"></i> Connecting to console...</div>');
        
        console.log('Loading logs for server:', serverId, 'owner:', ownerId);
        
        // Set a fallback timeout in case AJAX hangs completely
        const timeoutId = setTimeout(() => {
            console.error('AJAX request appears to be hanging - no response after 15 seconds');
            logsContainer.html('<div class="text-danger">Request hanging - check network connection, CORS, or server status</div>');
        }, 15000);
        
        // First get websocket connection details
        $.ajax({
            url: `/api/server/${serverId}/logs?ownerId=${ownerId}`,
            method: 'GET',
            timeout: 10000, // 10 second timeout
            success: function(response, status, xhr) {
                clearTimeout(timeoutId); // Clear the fallback timeout
                console.log('Console websocket response:', response);
                console.log('Response status:', xhr.status);
                
                if (response.success && response.logs) {
                    if (response.logs.error) {
                        // Handle API error
                        console.log('API returned error:', response.logs);
                        logsContainer.html(`<div class="text-danger">Failed to connect to console: ${response.logs.message || 'Unknown error'}</div>`);
                        if (response.logs.status === 404) {
                            logsContainer.append('<div class="text-muted mt-2">This might mean the server is not accessible or the console feature is not available.</div>');
                        }
                    } else if (response.logs.logs) {
                        // Application API returned logs directly
                        console.log('Received logs from application API');
                        displayLogs(response.logs.logs);
                    } else {
                        // Client API returned websocket details
                        console.log('Connecting to websocket...');
                        connectToConsole(response.logs, logsContainer);
                    }
                } else {
                    console.log('Response missing success or logs:', response);
                    logsContainer.html('<div class="text-danger">Failed to get console connection details</div>');
                }
            },
            error: function(xhr, status, error) {
                clearTimeout(timeoutId); // Clear the fallback timeout
                console.error('AJAX error:', {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    responseText: xhr.responseText,
                    error: error
                });
                
                let errorMessage = 'Error getting console details';
                if (xhr.status === 404) {
                    errorMessage = 'Server or API endpoint not found';
                } else if (xhr.status === 500) {
                    errorMessage = 'Server error - check server logs';
                } else if (status === 'timeout') {
                    errorMessage = 'Request timed out - server may be unreachable';
                }
                
                logsContainer.html(`<div class="text-danger">${errorMessage}</div>`);
            }
        });
    }

    function connectToConsole(wsData, logsContainer) {
        console.log('Connecting to websocket:', wsData);
        
        if (!wsData.data || !wsData.data.socket || !wsData.data.token) {
            logsContainer.html('<div class="text-danger">Invalid websocket connection data</div>');
            return;
        }

        const wsUrl = wsData.data.socket + '?token=' + wsData.data.token;
        console.log('WebSocket URL:', wsUrl);
        
        try {
            const ws = new WebSocket(wsUrl);
            let logLines = [];
            
            ws.onopen = function(event) {
                console.log('WebSocket connected');
                logsContainer.html('<div class="text-success text-center">Connected to console - waiting for output...</div>');
            };
            
            ws.onmessage = function(event) {
                console.log('WebSocket message:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.event === 'console output') {
                        logLines.push(data.data);
                        // Keep only last 100 lines
                        if (logLines.length > 100) {
                            logLines = logLines.slice(-100);
                        }
                        displayLogs(logLines);
                    } else if (data.event === 'status') {
                        console.log('Server status:', data.data);
                    }
                } catch (e) {
                    console.log('Raw message:', event.data);
                    // If it's not JSON, treat as plain text
                    logLines.push(event.data);
                    if (logLines.length > 100) {
                        logLines = logLines.slice(-100);
                    }
                    displayLogs(logLines);
                }
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
                logsContainer.html('<div class="text-danger">WebSocket connection error</div>');
            };
            
            ws.onclose = function(event) {
                console.log('WebSocket closed:', event.code, event.reason);
                logsContainer.html('<div class="text-warning text-center">Console connection closed</div>');
            };
            
            // Store websocket reference for cleanup
            logsContainer.data('websocket', ws);
            
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            logsContainer.html('<div class="text-danger">Failed to create WebSocket connection</div>');
        }
    }

    function displayLogs(logLines) {
        const logsContainer = $('#logsContainer');
        if (!logLines || logLines.length === 0) {
            logsContainer.html('<div class="text-muted">No logs received yet...</div>');
            return;
        }
        
        let html = '';
        logLines.forEach(log => {
            // Escape HTML characters for security
            const escapedLog = String(log).replace(/[&<>"']/g, function(match) {
                const escapeMap = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                };
                return escapeMap[match];
            });
            html += '<div class="log-line">' + escapedLog + '</div>';
        });
        
        logsContainer.html(html);
        // Auto-scroll to bottom
        logsContainer.scrollTop(logsContainer[0].scrollHeight);
    }
});

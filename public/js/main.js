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
                            logsContainer.append('<div class="text-muted mt-2">Console access may not be available for this server.</div>');
                        }
                    } else {
                        // Connect to websocket for real-time console streaming
                        console.log('Connecting to console websocket...');
                        connectToConsoleWebSocket(response.logs, logsContainer);
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

    function connectToConsoleWebSocket(wsDetails, logsContainer) {
        if (!wsDetails || !wsDetails.socket || !wsDetails.token) {
            logsContainer.html('<div class="text-danger">Invalid websocket details received from server.</div>');
            return;
        }

        console.log('WebSocket details:', wsDetails);

        // Create websocket connection
        const ws = new WebSocket(wsDetails.socket);

        // Connection opened
        ws.onopen = function(event) {
            console.log('WebSocket connection opened');
            logsContainer.html('<div class="text-success">Connected to console. Loading logs...</div>');

            // Authenticate with the token
            ws.send(JSON.stringify({
                event: 'auth',
                args: [wsDetails.token]
            }));
        };

        // Listen for messages
        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message:', data);

                if (data.event === 'auth success') {
                    console.log('Authentication successful');
                    logsContainer.html('<div class="text-success">Console connected. Waiting for output...</div>');

                    // Request initial console output
                    ws.send(JSON.stringify({
                        event: 'send logs',
                        args: [null]
                    }));

                } else if (data.event === 'console output') {
                    // Display console output
                    if (data.args && data.args[0]) {
                        displayConsoleOutput(data.args[0], logsContainer);
                    }

                } else if (data.event === 'status') {
                    console.log('Server status:', data.args[0]);

                } else if (data.event === 'token expiring') {
                    console.log('Token expiring, reconnecting...');
                    // Token is expiring, we might need to refresh

                } else if (data.event === 'token expired') {
                    console.log('Token expired');
                    logsContainer.html('<div class="text-warning">Console session expired. Please refresh the page.</div>');
                    ws.close();
                }

            } catch (e) {
                console.error('Error parsing websocket message:', e);
            }
        };

        // Connection closed
        ws.onclose = function(event) {
            console.log('WebSocket connection closed:', event.code, event.reason);
            if (event.code !== 1000) { // Not a normal closure
                logsContainer.append('<div class="text-warning mt-2">Console connection lost. Attempting to reconnect...</div>');
                // Could implement reconnection logic here
            }
        };

        // Connection error
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            logsContainer.html('<div class="text-danger">Failed to connect to console websocket.</div>');
        };

        // Store websocket reference for command sending
        logsContainer.data('websocket', ws);
    }

    function displayConsoleOutput(output, logsContainer) {
        // Get current content or initialize empty array
        let logLines = logsContainer.data('logLines') || [];
        
        // Split output by newlines and add each line
        const newLines = output.split('\n');
        logLines = logLines.concat(newLines);
        
        // Keep only last 200 lines to prevent memory issues
        if (logLines.length > 200) {
            logLines = logLines.slice(-200);
        }
        
        // Store updated log lines
        logsContainer.data('logLines', logLines);
        
        // Display the logs
        displayLogs(logLines, logsContainer);
    }

    function displayLogs(logLines, container = $('#logsContainer')) {
        if (!logLines || logLines.length === 0) {
            container.html('<div class="text-muted">No logs received yet...</div>');
            return;
        }
        
        let html = '';
        logLines.forEach(log => {
            if (log.trim()) { // Skip empty lines
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
            }
        });
        
        container.html(html);
        // Auto-scroll to bottom
        container.scrollTop(container[0].scrollHeight);
    }

    $('#sendCommandBtn').click(function() {
        const command = $('#consoleCommand').val().trim();
        if (!command) return;
        
        const logsContainer = $('#logsContainer');
        const ws = logsContainer.data('websocket');
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('Sending command:', command);
            ws.send(JSON.stringify({
                event: 'send command',
                args: [command]
            }));
            
            // Add command to display with a prompt
            const logLines = logsContainer.data('logLines') || [];
            logLines.push(`> ${command}`);
            logsContainer.data('logLines', logLines);
            displayLogs(logLines, logsContainer);
            
            // Clear the input
            $('#consoleCommand').val('');
        } else {
            alert('Console connection is not active. Please refresh the logs.');
        }
    });

    // Allow Enter key to send commands
    $('#consoleCommand').keypress(function(e) {
        if (e.which === 13) { // Enter key
            $('#sendCommandBtn').click();
        }
    });
});

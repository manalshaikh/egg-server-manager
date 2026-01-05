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
    $('#consoleModal').on('show.bs.modal', function (event) {
        const button = $(event.relatedTarget);
        const serverId = button.data('server-id');
        const ownerId = button.data('owner-id');
        
        const modal = $(this);
        modal.data('server-id', serverId);
        modal.data('owner-id', ownerId);
        
        modal.find('#consoleCommand').val('');
    });

    $('#sendCommandBtn').click(function() {
        const modal = $('#consoleModal');
        const serverId = modal.data('server-id');
        const ownerId = modal.data('owner-id');
        const command = $('#consoleCommand').val().trim();
        
        if (!command) {
            alert('Please enter a command.');
            return;
        }
        
        $(this).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Sending...');
        
        $.ajax({
            url: `/api/server/${serverId}/command`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ command: command, ownerId: ownerId }),
            success: function(response) {
                if (response.success) {
                    alert('Command sent successfully!');
                    modal.modal('hide');
                } else {
                    alert('Failed to send command: ' + response.message);
                }
            },
            error: function() {
                alert('Error sending command.');
            },
            complete: function() {
                $('#sendCommandBtn').prop('disabled', false).html('Send Command');
            }
        });
    });
});

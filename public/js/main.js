$(document).ready(function() {
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
                    // Ideally we would poll for status update, but for now let's just reload or show success
                    // Reloading page to get fresh state is easiest for this simple app
                    setTimeout(() => {
                        location.reload();
                    }, 2000); // Wait a bit for the server to process the signal
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
});

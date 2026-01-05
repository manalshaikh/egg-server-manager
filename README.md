# Egg Server Manager

A modern, feature-rich Web Dashboard and Discord Bot for managing Pterodactyl game servers. Built with Node.js, Express, and Discord.js.

## Features

### 🖥️ Web Dashboard
- **Modern UI**: Sleek glassmorphism design with animated backgrounds and responsive sidebar layout.
- **Server Management**: Start, stop, and restart your Pterodactyl servers directly from the dashboard.
- **Real-time Status**: Auto-refreshing server status indicators.
- **User Management**: 
  - Admin/User roles.
  - Per-user API key configuration.
  - Secure password management.
- **Security**:
  - IP Ban system with automatic rate limiting.
  - Cloudflare Turnstile Captcha integration.
  - Secure session handling.
- **Logging**: Comprehensive action logs for all user activities (logins, server actions, bans).

### 🤖 Discord Bot
- Control your servers directly from Discord.
- Status monitoring and commands.

## Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/manalshaikh/egg-server-manager.git
    cd egg-server-manager
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configuration**
    Create a `.env` file in the root directory with the following variables:
    ```env
    PORT=3000
    DISCORD_TOKEN=your_discord_bot_token
    DISCORD_CLIENT_ID=your_discord_client_id
    # Add other necessary env vars here
    ```

4.  **Run the Application**
    ```bash
    # Development
    node index.js

    # Production (using PM2)
    pm2 start index.js --name "egg-manager"
    ```

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (Sequelize ORM)
- **Frontend**: EJS, Bootstrap 5, Custom CSS
- **Bot**: Discord.js v14
- **Security**: Bcrypt, Cloudflare Turnstile

## License

MIT

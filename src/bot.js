const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const ptero = require('./ptero');
const { User } = require('./db');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!servers') {
        const users = await User.findAll();
        let allServers = [];

        for (const user of users) {
            if (user.ptero_url && user.ptero_api_key) {
                const servers = await ptero.getServers(user.ptero_url, user.ptero_api_key);
                const serversWithOwner = servers.map(s => ({ ...s, ownerId: user.id, ownerName: user.username }));
                allServers = allServers.concat(serversWithOwner);
            }
        }
        
        if (allServers.length === 0) {
            return message.reply('No servers found or error fetching servers.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Game Servers')
            .setColor(0x0099FF)
            .setDescription('Here are your available servers:');

        const rows = [];

        for (const server of allServers) {
            const user = users.find(u => u.id === server.ownerId);
            const state = await ptero.getServerState(user.ptero_url, user.ptero_api_key, server.id);
            
            embed.addFields({ 
                name: `${server.name} (${server.ownerName})`, 
                value: `ID: \`${server.id}\`\nState: **${state}**`, 
                inline: true 
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`start_${server.id}_${server.ownerId}`)
                        .setLabel(`Start`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`stop_${server.id}_${server.ownerId}`)
                        .setLabel(`Stop`)
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`restart_${server.id}_${server.ownerId}`)
                        .setLabel(`Restart`)
                        .setStyle(ButtonStyle.Primary)
                );
            rows.push(row);
        }

        // Discord allows max 5 action rows per message.
        await message.reply({ embeds: [embed], components: rows.slice(0, 5) });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, serverId, ownerId] = interaction.customId.split('_');
    
    await interaction.deferReply({ ephemeral: true });

    const user = await User.findByPk(ownerId);
    if (!user || !user.ptero_url || !user.ptero_api_key) {
        return interaction.editReply('Owner credentials not found.');
    }

    let success = false;
    if (action === 'start') {
        success = await ptero.setPowerState(user.ptero_url, user.ptero_api_key, serverId, 'start');
    } else if (action === 'stop') {
        success = await ptero.setPowerState(user.ptero_url, user.ptero_api_key, serverId, 'stop');
    } else if (action === 'restart') {
        success = await ptero.setPowerState(user.ptero_url, user.ptero_api_key, serverId, 'restart');
    }

    if (success) {
        await interaction.editReply(`Signal **${action}** sent to server \`${serverId}\`.`);
    } else {
        await interaction.editReply(`Failed to send signal **${action}** to server \`${serverId}\`.`);
    }
});

function startBot() {
    client.login(process.env.DISCORD_TOKEN);
}

module.exports = { startBot };

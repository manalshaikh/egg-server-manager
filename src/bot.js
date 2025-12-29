const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const ptero = require('./ptero');
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
        const servers = await ptero.getServers();
        
        if (servers.length === 0) {
            return message.reply('No servers found or error fetching servers.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Game Servers')
            .setColor(0x0099FF)
            .setDescription('Here are your available servers:');

        const rows = [];

        for (const server of servers) {
            const state = await ptero.getServerState(server.id);
            embed.addFields({ 
                name: server.name, 
                value: `ID: \`${server.id}\`\nState: **${state}**`, 
                inline: true 
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`start_${server.id}`)
                        .setLabel(`Start ${server.name}`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`stop_${server.id}`)
                        .setLabel(`Stop ${server.name}`)
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`restart_${server.id}`)
                        .setLabel(`Restart ${server.name}`)
                        .setStyle(ButtonStyle.Primary)
                );
            rows.push(row);
        }

        // Discord allows max 5 action rows per message. If user has many servers, this might break.
        // For now, we'll slice to 5.
        await message.reply({ embeds: [embed], components: rows.slice(0, 5) });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, serverId] = interaction.customId.split('_');
    
    await interaction.deferReply({ ephemeral: true });

    let success = false;
    if (action === 'start') {
        success = await ptero.setPowerState(serverId, 'start');
    } else if (action === 'stop') {
        success = await ptero.setPowerState(serverId, 'stop');
    } else if (action === 'restart') {
        success = await ptero.setPowerState(serverId, 'restart');
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

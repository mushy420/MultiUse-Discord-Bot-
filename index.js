
// Main entry point for the Discord bot
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('./config.js');
const { setupLogger, logger } = require('./logger.js');
const { registerCommands } = require('./commands.js');
const { initializeTicketSystem } = require('./tickets.js');

// Check for required environment variables
function checkRequiredEnvVars() {
  const required = ['DISCORD_TOKEN', 'CLIENT_ID'];
  const missing = required.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.error('Error: Missing required environment variables:');
    missing.forEach(envVar => console.error(`- ${envVar}`));
    console.error('Please add them to your .env file and restart the bot.');
    process.exit(1);
  }
}

// Initialize the Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize collections to store commands
client.commands = new Collection();
client.cooldowns = new Collection();

// Setup error handling
process.on('unhandledRejection', (error) => {
  logger.error(`Unhandled rejection: ${error}`);
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  logger.error(error.stack);
  console.error('Uncaught exception:', error);
  
  // Give logger time to write before exiting
  setTimeout(() => {
    console.error('An uncaught exception caused the bot to crash. Exiting...');
    process.exit(1);
  }, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Bot shutdown initiated (SIGINT)');
  gracefulShutdown();
});

process.on('SIGTERM', () => {
  logger.info('Bot shutdown initiated (SIGTERM)');
  gracefulShutdown();
});

function gracefulShutdown() {
  logger.info('Shutting down gracefully...');
  
  // Perform cleanup
  if (client && client.isReady()) {
    client.destroy();
    logger.info('Discord client destroyed');
  }
  
  // Exit process
  setTimeout(() => {
    logger.info('Bot shutdown complete');
    process.exit(0);
  }, 1500);
}

// Set up the bot when it's ready
client.once(Events.ClientReady, () => {
  logger.info(`Bot is online! Logged in as ${client.user.tag}`);
  client.user.setActivity('your commands', { type: 'LISTENING' });
  
  // Register and deploy slash commands
  registerCommands(client)
    .then(() => logger.info('Commands registered successfully'))
    .catch(err => logger.error(`Failed to register commands: ${err}`));
    
  // Initialize ticket system
  initializeTicketSystem(client);
});

// Handle interactions (slash commands)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command) {
        logger.warn(`Command not found: ${interaction.commandName}`);
        return;
      }
      
      // Check cooldowns
      const { cooldowns } = client;
      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
      }
      
      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;
      
      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return interaction.reply({
            content: `Please wait ${timeLeft.toFixed(1)} more seconds before using the \`${command.data.name}\` command.`,
            ephemeral: true
          });
        }
      }
      
      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
      
      // Execute the command
      await command.execute(interaction, client);
      logger.info(`Command executed: ${interaction.commandName} by ${interaction.user.tag}`);
    } 
    // Handle buttons (used for ticket system)
    else if (interaction.isButton()) {
      // Ticket system button handling is in tickets.js
      if (interaction.customId.startsWith('ticket_')) {
        const { handleTicketButton } = require('./tickets.js');
        await handleTicketButton(interaction, client);
      }
    }
  } catch (error) {
    logger.error(`Error handling interaction: ${error}`);
    
    // Reply to the user that an error occurred
    const replyContent = { 
      content: 'There was an error while executing this command!', 
      ephemeral: true 
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyContent).catch(err => {
        logger.error(`Could not send error followup: ${err}`);
      });
    } else {
      await interaction.reply(replyContent).catch(err => {
        logger.error(`Could not send error reply: ${err}`);
      });
    }
  }
});

// Handle member join events
client.on(Events.GuildMemberAdd, (member) => {
  logger.info(`New member joined: ${member.user.tag} in ${member.guild.name}`);
  // You can add welcome messages or role assignments here
});

// Handle errors
client.on(Events.Error, (error) => {
  logger.error(`Client error: ${error.message}`);
});

// Initialize the bot
async function init() {
  try {
    // Check for required environment variables
    checkRequiredEnvVars();
    
    // Setup logger first
    setupLogger();
    logger.info('Starting bot...');
    
    // Login to Discord
    await client.login(config.token);
  } catch (error) {
    console.error('Failed to initialize bot:', error);
    logger.error(`Initialization error: ${error.message}`);
    process.exit(1);
  }
}

// Start the bot
init();

import { Client, GatewayIntentBits, Events, REST, Routes, MessageFlags } from 'discord.js';
import { config } from 'dotenv';
import play from 'play-dl';
import { MusicQueue } from './musicQueue.js';
import { commands, allCommands, handleCommand } from './commands.js';
import { resolveDMContext, updateUserGuildTracking } from './dmContext.js';
import { handleContextMenuCommand, handleModalSubmit } from './contextMenuHandlers.js';

config();

// Initialize play-dl
async function initializePlayDl() {
  try {
    await play.getFreeClientID();
    console.log('play-dl initialized successfully');
  } catch (error) {
    console.warn('No play-dl authorization found. Bot may face rate limits.');
    console.warn('Run: node src/setup-youtube.js to authenticate');
  }
}

await initializePlayDl();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ]
});

const guildQueues = new Map();

// Track last active guild per user for DM support
const userLastGuild = new Map(); // Map<userId, guildId>

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Bot is ready!');
  console.log('Using yt-dlp for local streaming');

  try {
    console.log('Started refreshing application (/) commands.');

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    // If GUILD_ID is provided, register as guild commands for instant availability
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: allCommands },
      );
      console.log(`Registered guild commands for guild ${guildId}`);
    }

    // Also register global (may take up to an hour to propagate)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: allCommands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  console.log(`Received interaction: ${interaction.commandName || interaction.customId}`);

  // Resolve context (works for both guild and DM)
  const context = await resolveDMContext(interaction, client, userLastGuild);

  if (!context.guildId) {
    // Error already sent to user by resolveDMContext
    return;
  }

  // Track this interaction for future DM commands (only for guild interactions)
  if (!context.isDM) {
    updateUserGuildTracking(interaction.user.id, context.guildId, userLastGuild);
  }

  const guildId = context.guildId;

  if (!guildQueues.has(guildId)) {
    guildQueues.set(guildId, new MusicQueue());
  }

  const musicQueue = guildQueues.get(guildId);

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction, musicQueue, context);
    return;
  }

  // Handle button interactions
  if (interaction.isButton()) {
    try {
      switch (interaction.customId) {
        case 'pause':
          if (musicQueue.isPlaying) {
            musicQueue.pause();
            await interaction.reply({ content: '⏸️ Paused', flags: MessageFlags.Ephemeral });
          } else {
            musicQueue.resume();
            await interaction.reply({ content: '▶️ Resumed', flags: MessageFlags.Ephemeral });
          }
          break;

        case 'skip':
          if (musicQueue.isPlaying) {
            musicQueue.skip();
            await interaction.reply({ content: '⏭️ Skipped', flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: 'Nothing is playing!', flags: MessageFlags.Ephemeral });
          }
          break;

        case 'queue':
          const { createQueueEmbed } = await import('./radioEmbeds.js');
          const embed = createQueueEmbed(musicQueue.getQueue(), musicQueue.getCurrentSong());
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          break;

        case 'radio':
          const newRadioState = !musicQueue.radioMode;
          const voiceChannel = context.voiceChannel;

          // Check if user is in voice channel
          if (!voiceChannel && newRadioState) {
            const errorMsg = context.isDM
              ? '❌ You need to be in a voice channel in your last active server to enable radio mode!'
              : '❌ You need to be in a voice channel to enable radio mode!';
            await interaction.reply({
              content: errorMsg,
              flags: MessageFlags.Ephemeral
            });
            break;
          }

          // Connect to voice if not already connected and enabling radio
          if (!musicQueue.connection && newRadioState) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            console.log('Radio button: Connecting to voice...');
            const connected = await musicQueue.connect(voiceChannel, interaction.channel);

            if (!connected) {
              await interaction.editReply({
                content: '❌ Failed to connect to voice channel! Check bot permissions.'
              });
              break;
            }
            console.log('Radio button: Successfully connected!');
          }

          musicQueue.setRadioMode(newRadioState);
          musicQueue.updateActiveUsers();

          const replyContent = newRadioState ? '📻 Radio mode enabled!' : '📻 Radio mode disabled';

          if (interaction.deferred) {
            await interaction.editReply({ content: replyContent });
          } else {
            await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
          }

          // If turning on radio and nothing is playing, start playing
          if (newRadioState && !musicQueue.isPlaying) {
            console.log('Radio button: Starting radio playback...');
            musicQueue.playNext();
          }
          break;

        default:
          await interaction.reply({ content: 'Unknown button!', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      console.error('Button interaction error:', error);
      if (!interaction.replied) {
        await interaction.reply({ content: 'Error processing button click', flags: MessageFlags.Ephemeral });
      }
    }
  }

  // Handle context menu (right-click) commands
  if (interaction.isUserContextMenuCommand()) {
    try {
      await handleContextMenuCommand(interaction, musicQueue, context);
    } catch (error) {
      console.error('Context menu error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error processing command', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  // Handle modal (form) submissions
  if (interaction.isModalSubmit()) {
    try {
      await handleModalSubmit(interaction, musicQueue, context);
    } catch (error) {
      console.error('Modal submit error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error processing request', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guildId = oldState.guild.id;
  const musicQueue = guildQueues.get(guildId);

  if (!musicQueue || !musicQueue.voiceChannel) return;

  if (oldState.channelId === musicQueue.voiceChannel.id ||
      newState.channelId === musicQueue.voiceChannel.id) {
    musicQueue.updateActiveUsers();

    const nonBotMembers = musicQueue.voiceChannel.members.filter(m => !m.user.bot);

    if (nonBotMembers.size === 0 && musicQueue.connection) {
      console.log('Everyone left the voice channel, disconnecting in 60 seconds...');
      setTimeout(async () => {
        const currentMembers = musicQueue.voiceChannel?.members?.filter(m => !m.user.bot);
        if (!currentMembers || currentMembers.size === 0) {
          console.log('Still empty, disconnecting and cleaning up...');
          await musicQueue.disconnect();
        }
      }, 60000);
    }
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');

  // Clean up all guild queues
  for (const [guildId, queue] of guildQueues) {
    console.log(`Cleaning up guild ${guildId}...`);
    await queue.disconnect();
  }

  client.destroy();
  process.exit(0);
});

// Basic env validation
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in environment. Please set them in a .env file.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

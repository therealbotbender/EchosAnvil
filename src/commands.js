import { SlashCommandBuilder } from 'discord.js';
import play from 'play-dl';
import { getUserSongs, getStats } from './database.js';
import {
  createSongAddedEmbed,
  createPlaylistAddedEmbed,
  createQueueEmbed,
  createNowPlayingEmbed,
  createRadioModeEmbed,
  createUserSongsEmbed,
  createStatsEmbed,
  createInfoEmbed,
  createErrorEmbed,
  createPlaybackButtons
} from './radioEmbeds.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue (YouTube, SoundCloud, Spotify, Deezer)')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('URL (YouTube/SoundCloud/Spotify/Deezer) or song name to search')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('priority')
        .setDescription('Add song to the front of the queue')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a song on YouTube and play it')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name or search query')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('priority')
        .setDescription('Add song to the front of the queue')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Add an entire YouTube playlist to the queue')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('YouTube playlist URL')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing song'),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused song'),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the entire queue'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel'),

  new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Toggle radio mode (plays personalized songs based on users in call)')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Turn radio on or off')
        .setRequired(true)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )),

  new SlashCommandBuilder()
    .setName('discovery')
    .setDescription('Toggle discovery mode (finds new songs similar to what you like)')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Turn discovery mode on or off')
        .setRequired(true)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )),

  new SlashCommandBuilder()
    .setName('mysongs')
    .setDescription('View your song request history')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of songs to show (default: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot statistics'),

  new SlashCommandBuilder()
    .setName('crossfade')
    .setDescription('Configure crossfade duration between songs')
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Crossfade duration in seconds (1-10, default: 3)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)),
].map(command => command.toJSON());

export async function handleCommand(interaction, musicQueue, context) {
  try {
    switch (interaction.commandName) {
      case 'play':
        await handlePlayCommand(interaction, musicQueue, context);
        break;
      case 'search':
        await handleSearchCommand(interaction, musicQueue, context);
        break;
      case 'playlist':
        await handlePlaylistCommand(interaction, musicQueue, context);
        break;
      case 'skip':
        await handleSkipCommand(interaction, musicQueue);
        break;
      case 'queue':
        await handleQueueCommand(interaction, musicQueue);
        break;
      case 'nowplaying':
        await handleNowPlayingCommand(interaction, musicQueue);
        break;
      case 'pause':
        await handlePauseCommand(interaction, musicQueue);
        break;
      case 'resume':
        await handleResumeCommand(interaction, musicQueue);
        break;
      case 'clear':
        await handleClearCommand(interaction, musicQueue);
        break;
      case 'leave':
        await handleLeaveCommand(interaction, musicQueue);
        break;
      case 'radio':
        await handleRadioCommand(interaction, musicQueue, context);
        break;
      case 'discovery':
        await handleDiscoveryCommand(interaction, musicQueue);
        break;
      case 'mysongs':
        await handleMySongsCommand(interaction);
        break;
      case 'stats':
        await handleStatsCommand(interaction);
        break;
      case 'crossfade':
        await handleCrossfadeCommand(interaction, musicQueue);
        break;
      default:
        await interaction.reply({ content: 'Unknown command!', ephemeral: true });
    }
  } catch (error) {
    console.error('Command error:', error);

    // Don't try to respond if interaction is already expired
    if (error.code === 10062) {
      console.log('Interaction expired - command took too long');
      return;
    }

    try {
      const errorEmbed = createErrorEmbed(`Error: ${error.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
      }
    } catch (replyError) {
      console.error('Could not send error message:', replyError.message);
    }
  }
}

async function handlePlayCommand(interaction, musicQueue, context) {
  console.log('=== PLAY COMMAND START ===');
  console.log(`User: ${interaction.user.username}`);

  // Get parameters first (so we can use them even if defer fails)
  const query = interaction.options.getString('query');
  const priority = interaction.options.getBoolean('priority') || false;
  const voiceChannel = context.voiceChannel;

  console.log(`Query: ${query}`);
  console.log(`Voice channel: ${voiceChannel?.name || 'none'}`);

  // Detect source type from URL
  let sourceType = 'search';
  if (query.includes('youtube.com') || query.includes('youtu.be')) {
    sourceType = 'youtube';
  } else if (query.includes('soundcloud.com')) {
    sourceType = 'soundcloud';
  } else if (query.includes('spotify.com')) {
    sourceType = 'spotify';
  } else if (query.includes('deezer.com')) {
    sourceType = 'deezer';
  } else if (query.startsWith('http')) {
    sourceType = 'url';
  }

  const isUrl = sourceType !== 'search';

  // Try to defer, but if it fails, we'll just send messages to the channel
  let useChannelFallback = false;
  try {
    await interaction.deferReply();
    console.log('✓ Deferred reply');
  } catch (deferError) {
    console.error('❌ Failed to defer:', deferError.message);
    console.log('⚠️ Using channel message fallback due to interaction timeout');
    useChannelFallback = true;

    // If we can't even defer, try a quick reply
    try {
      await interaction.reply({ content: isUrl ? '🔄 Processing your request...' : '🔍 Searching...', ephemeral: true });
      useChannelFallback = false;
    } catch (replyError) {
      // Both failed - will use channel fallback
      console.log('⚠️ Interaction completely expired, using channel messages');
    }
  }

  // Validate voice channel
  if (!voiceChannel) {
    const errorMsg = context.isDM
      ? '❌ You need to be in a voice channel in your last active server to play music!'
      : '❌ You need to be in a voice channel to play music!';
    if (useChannelFallback) {
      await interaction.channel.send(errorMsg).catch(console.error);
    } else {
      const embedMsg = context.isDM
        ? 'You need to be in a voice channel in your last active server to play music!'
        : 'You need to be in a voice channel to play music!';
      const embed = createErrorEmbed(embedMsg);
      await interaction.editReply({ embeds: [embed] }).catch(console.error);
    }
    return;
  }

  // Do everything else asynchronously
  try {
    let url = query;
    let isSearchResult = false;

    // If it's not a URL, search for it (try multiple sources)
    if (!isUrl) {
      console.log('Not a URL, searching across sources...');

      // Try sources in order: SoundCloud (less traffic), YouTube (fallback)
      const searchSources = [
        { name: 'SoundCloud', config: { source: { soundcloud: 'tracks' }, limit: 1 } },
        { name: 'YouTube', config: { limit: 1 } }
      ];

      let searchResults = [];
      let searchSource = '';

      for (const source of searchSources) {
        try {
          console.log(`Trying ${source.name}...`);
          searchResults = await play.search(query, source.config);
          if (searchResults.length > 0) {
            searchSource = source.name;
            console.log(`✓ Found on ${source.name}: ${searchResults[0].title}`);
            break;
          }
        } catch (error) {
          console.log(`${source.name} search failed: ${error.message}`);
          continue;
        }
      }

      if (searchResults.length === 0) {
        const errorMsg = `❌ No results found for: ${query}`;
        if (useChannelFallback) {
          await interaction.channel.send(errorMsg).catch(console.error);
        } else {
          const embed = createErrorEmbed(`No results found for: ${query}`);
          await interaction.editReply({ embeds: [embed] }).catch(console.error);
        }
        return;
      }

      url = searchResults[0].url;
      isSearchResult = true;
      sourceType = searchSource.toLowerCase();
      console.log(`Found: ${searchResults[0].title} - ${url}`);
    }

    // Step 1: Add song to queue FIRST (fast operation)
    console.log('Step 1: Adding song to queue...');
    const song = await musicQueue.addSong(url, interaction.user.id, interaction.user.username, priority);
    console.log(`Song added: ${song.title}`);

    // Send success message
    const position = musicQueue.getQueue().length + (musicQueue.isPlaying ? 1 : 0);

    // Get source emoji
    const sourceEmojis = {
      youtube: '📺',
      soundcloud: '🎵',
      spotify: '🎧',
      deezer: '🎶',
      search: '🔍'
    };
    const sourceEmoji = sourceEmojis[sourceType] || '✅';

    if (useChannelFallback) {
      const prefix = isSearchResult ? `${sourceEmoji} Found and added:` : '✅ Added';
      await interaction.channel.send(`${prefix} **${song.title}** to queue (position ${position})`).catch(console.error);
    } else {
      const embed = createSongAddedEmbed(song, position, priority);
      if (isSearchResult) {
        const sourceName = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
        embed.setFooter({ text: `${sourceEmoji} ${sourceName} result for: ${query}` });
      } else if (sourceType !== 'youtube') {
        const sourceName = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
        embed.setFooter({ text: `${sourceEmoji} Source: ${sourceName}` });
      }
      await interaction.editReply({ embeds: [embed] }).catch(console.error);
    }

    // Step 2: Connect to voice if needed
    if (!musicQueue.connection) {
      console.log('Step 2: Connecting to voice...');

      const connected = await musicQueue.connect(voiceChannel, interaction.channel);

      if (!connected) {
        const errorMsg = '❌ Failed to connect to voice channel! Check bot permissions.';
        if (useChannelFallback) {
          await interaction.channel.send(errorMsg).catch(console.error);
        } else {
          const errorEmbed = createErrorEmbed('Failed to connect to voice channel! Check bot permissions and network.');
          await interaction.followUp({ embeds: [errorEmbed] }).catch(console.error);
        }
        return;
      }
      console.log('Successfully connected!');
    }

    // Step 3: Start playing if not already
    if (!musicQueue.isPlaying) {
      console.log('Step 3: Starting playback...');
      musicQueue.playNext();
    }

    console.log('=== PLAY COMMAND SUCCESS ===');
  } catch (error) {
    console.error('Error in play command:', error);
    const errorMsg = `❌ Failed: ${error.message}`;
    if (useChannelFallback) {
      await interaction.channel.send(errorMsg).catch(console.error);
    } else {
      const errorEmbed = createErrorEmbed(`Failed: ${error.message}`);
      await interaction.editReply({ embeds: [errorEmbed] }).catch(console.error);
    }
  }
}

async function handleSearchCommand(interaction, musicQueue, context) {
  console.log('=== SEARCH COMMAND START ===');
  console.log(`User: ${interaction.user.username}`);

  const query = interaction.options.getString('query');
  const priority = interaction.options.getBoolean('priority') || false;
  const voiceChannel = context.voiceChannel;

  console.log(`Query: ${query}`);
  console.log(`Voice channel: ${voiceChannel?.name || 'none'}`);

  // Try to defer
  let useChannelFallback = false;
  try {
    await interaction.deferReply();
    console.log('✓ Deferred reply');
  } catch (deferError) {
    console.error('❌ Failed to defer:', deferError.message);
    useChannelFallback = true;
    try {
      await interaction.reply({ content: '🔍 Searching...', ephemeral: true });
      useChannelFallback = false;
    } catch (replyError) {
      console.log('⚠️ Interaction expired, using channel messages');
    }
  }

  // Validate voice channel
  if (!voiceChannel) {
    const errorMsg = context.isDM
      ? '❌ You need to be in a voice channel in your last active server to play music!'
      : '❌ You need to be in a voice channel to play music!';
    if (useChannelFallback) {
      await interaction.channel.send(errorMsg).catch(console.error);
    } else {
      const embedMsg = context.isDM
        ? 'You need to be in a voice channel in your last active server to play music!'
        : 'You need to be in a voice channel to play music!';
      const embed = createErrorEmbed(embedMsg);
      await interaction.editReply({ embeds: [embed] }).catch(console.error);
    }
    return;
  }

  try {
    // Search YouTube
    console.log('Searching YouTube...');
    const searchResults = await play.search(query, { limit: 1 });

    if (searchResults.length === 0) {
      const errorMsg = `❌ No results found for: ${query}`;
      if (useChannelFallback) {
        await interaction.channel.send(errorMsg).catch(console.error);
      } else {
        const embed = createErrorEmbed(`No results found for: ${query}`);
        await interaction.editReply({ embeds: [embed] }).catch(console.error);
      }
      return;
    }

    const firstResult = searchResults[0];
    const url = firstResult.url;

    console.log(`Found: ${firstResult.title} - ${url}`);

    // Add song to queue
    const song = await musicQueue.addSong(url, interaction.user.id, interaction.user.username, priority);
    console.log(`Song added: ${song.title}`);

    // Send success message
    const position = musicQueue.getQueue().length + (musicQueue.isPlaying ? 1 : 0);
    if (useChannelFallback) {
      await interaction.channel.send(`🔍 Found and added: **${song.title}** (position ${position})`).catch(console.error);
    } else {
      const embed = createSongAddedEmbed(song, position, priority);
      embed.setFooter({ text: `🔍 Search result for: ${query}` });
      await interaction.editReply({ embeds: [embed] }).catch(console.error);
    }

    // Connect to voice if needed
    if (!musicQueue.connection) {
      console.log('Connecting to voice...');
      const connected = await musicQueue.connect(voiceChannel, interaction.channel);

      if (!connected) {
        const errorMsg = '❌ Failed to connect to voice channel!';
        if (useChannelFallback) {
          await interaction.channel.send(errorMsg).catch(console.error);
        } else {
          const errorEmbed = createErrorEmbed('Failed to connect to voice channel!');
          await interaction.followUp({ embeds: [errorEmbed] }).catch(console.error);
        }
        return;
      }
      console.log('Successfully connected!');
    }

    // Start playing if not already
    if (!musicQueue.isPlaying) {
      console.log('Starting playback...');
      musicQueue.playNext();
    }

    console.log('=== SEARCH COMMAND SUCCESS ===');
  } catch (error) {
    console.error('Error in search command:', error);
    const errorMsg = `❌ Search failed: ${error.message}`;
    if (useChannelFallback) {
      await interaction.channel.send(errorMsg).catch(console.error);
    } else {
      const errorEmbed = createErrorEmbed(`Search failed: ${error.message}`);
      await interaction.editReply({ embeds: [errorEmbed] }).catch(console.error);
    }
  }
}

async function handlePlaylistCommand(interaction, musicQueue, context) {
  // Defer IMMEDIATELY before any processing to avoid timeout
  await interaction.deferReply();

  const url = interaction.options.getString('url');
  const voiceChannel = context.voiceChannel;

  if (!voiceChannel) {
    const embedMsg = context.isDM
      ? 'You need to be in a voice channel in your last active server to play music!'
      : 'You need to be in a voice channel to play music!';
    const embed = createErrorEmbed(embedMsg);
    return interaction.editReply({ embeds: [embed] });
  }

  if (!musicQueue.connection) {
    const connected = await musicQueue.connect(voiceChannel, interaction.channel);
    if (!connected) {
      return interaction.editReply('Failed to connect to voice channel!');
    }
  }

  try {
    const result = await musicQueue.addPlaylist(url, interaction.user.id, interaction.user.username);

    const embed = createPlaylistAddedEmbed(result.playlistTitle, result.totalSongs);
    await interaction.editReply({ embeds: [embed] });

    if (!musicQueue.isPlaying) {
      musicQueue.playNext();
    }
  } catch (error) {
    const errorEmbed = createErrorEmbed(`Failed to add playlist: ${error.message}`);
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleSkipCommand(interaction, musicQueue) {
  if (!musicQueue.isPlaying) {
    const embed = createErrorEmbed('Nothing is currently playing!');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const skippedSong = musicQueue.getCurrentSong();
  musicQueue.skip();

  const embed = createInfoEmbed('⏭️ Skipped', `Skipped **${skippedSong.title}**`);
  await interaction.reply({ embeds: [embed] });
}

async function handleQueueCommand(interaction, musicQueue) {
  const queue = musicQueue.getQueue();
  const current = musicQueue.getCurrentSong();

  const embed = createQueueEmbed(queue, current);
  await interaction.reply({ embeds: [embed] });
}

async function handleNowPlayingCommand(interaction, musicQueue) {
  const current = musicQueue.getCurrentSong();

  if (!current) {
    const embed = createErrorEmbed('Nothing is currently playing!');
    return interaction.reply({ embeds: [embed] });
  }

  const isRadioSong = current.requestedBy.id === 'radio';
  const embed = createNowPlayingEmbed(current, isRadioSong);
  const buttons = createPlaybackButtons(musicQueue.isPlaying, false);

  await interaction.reply({
    embeds: [embed],
    components: [buttons]
  });
}

async function handlePauseCommand(interaction, musicQueue) {
  if (!musicQueue.isPlaying) {
    const embed = createErrorEmbed('Nothing is currently playing!');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  musicQueue.pause();
  const embed = createInfoEmbed('⏸️ Paused', 'Music playback paused');
  await interaction.reply({ embeds: [embed] });
}

async function handleResumeCommand(interaction, musicQueue) {
  musicQueue.resume();
  const embed = createInfoEmbed('▶️ Resumed', 'Music playback resumed');
  await interaction.reply({ embeds: [embed] });
}

async function handleClearCommand(interaction, musicQueue) {
  const count = musicQueue.getQueue().length;
  musicQueue.clear();
  const embed = createInfoEmbed('🗑️ Queue Cleared', `Removed ${count} song${count !== 1 ? 's' : ''} from the queue`);
  await interaction.reply({ embeds: [embed] });
}

async function handleLeaveCommand(interaction, musicQueue) {
  if (!musicQueue.connection) {
    const embed = createErrorEmbed('Bot is not in a voice channel!');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  musicQueue.disconnect();
  const embed = createInfoEmbed('👋 Disconnected', 'Left the voice channel');
  await interaction.reply({ embeds: [embed] });
}

async function handleRadioCommand(interaction, musicQueue, context) {
  const mode = interaction.options.getString('mode');
  const enabled = mode === 'on';
  const voiceChannel = context.voiceChannel;

  // Check if user is in voice channel
  if (!voiceChannel) {
    const embedMsg = context.isDM
      ? 'You need to be in a voice channel in your last active server to use radio mode!'
      : 'You need to be in a voice channel to use radio mode!';
    const embed = createErrorEmbed(embedMsg);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Connect to voice if not already connected
  if (!musicQueue.connection) {
    await interaction.deferReply();
    console.log('Radio command: Connecting to voice...');
    const connected = await musicQueue.connect(voiceChannel, interaction.channel);

    if (!connected) {
      const embed = createErrorEmbed('Failed to connect to voice channel! Check bot permissions.');
      return interaction.editReply({ embeds: [embed] });
    }
    console.log('Radio command: Successfully connected!');
  }

  musicQueue.setRadioMode(enabled);
  musicQueue.updateActiveUsers();
  const userCount = musicQueue.activeUsers.size;

  const embed = createRadioModeEmbed(enabled, userCount);

  if (interaction.deferred) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }

  // If turning on radio and nothing is playing, start playing
  if (enabled && !musicQueue.isPlaying) {
    console.log('Radio command: Starting radio playback...');
    musicQueue.playNext();
  }
}

async function handleDiscoveryCommand(interaction, musicQueue) {
  const mode = interaction.options.getString('mode');
  const enabled = mode === 'on';

  if (!musicQueue.radioMode) {
    const embed = createErrorEmbed('Discovery mode requires radio mode to be enabled first! Use `/radio on`');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  musicQueue.setDiscoveryMode(enabled);

  const embed = createInfoEmbed(
    enabled ? '🔍 Discovery Mode Enabled' : '🔍 Discovery Mode Disabled',
    enabled
      ? 'Bot will now introduce new songs similar to what you like!\n\n• 30% of radio songs will be discoveries\n• Based on your listening history\n• 👍 React to add discoveries to your library'
      : 'Bot will only play songs from your existing library'
  );
  await interaction.reply({ embeds: [embed] });
}

async function handleMySongsCommand(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  const songs = getUserSongs(interaction.user.id, limit);

  const embed = createUserSongsEmbed(interaction.user.username, songs);
  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function handleStatsCommand(interaction) {
  const stats = getStats();
  const embed = createStatsEmbed(stats);
  await interaction.reply({ embeds: [embed] });
}

async function handleCrossfadeCommand(interaction, musicQueue) {
  const seconds = interaction.options.getInteger('seconds');

  if (seconds === null) {
    // Show current setting
    const currentSeconds = musicQueue.crossfadeDuration / 1000;
    const embed = createInfoEmbed(
      '🎚️ Crossfade Settings',
      `Current crossfade duration: **${currentSeconds} seconds**\n\nUse \`/crossfade seconds:X\` to change it (1-10 seconds)`
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Set new crossfade duration
  musicQueue.crossfadeDuration = seconds * 1000;

  const embed = createInfoEmbed(
    '🎚️ Crossfade Updated',
    `Crossfade duration set to **${seconds} second${seconds !== 1 ? 's' : ''}**\n\nSongs will now smoothly fade in and out when transitioning.`
  );
  await interaction.reply({ embeds: [embed] });
}

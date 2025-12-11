import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createQueueEmbed, createInfoEmbed, createErrorEmbed } from './radioEmbeds.js';

/**
 * Handle context menu (right-click) command interactions
 */
export async function handleContextMenuCommand(interaction, musicQueue, context) {
  const commandName = interaction.commandName;

  console.log(`Context menu command: ${commandName} by ${interaction.user.username}`);

  switch (commandName) {
    case 'Play Song':
      await handlePlaySongContextMenu(interaction);
      break;

    case 'Skip Song':
      await handleSkipContextMenu(interaction, musicQueue);
      break;

    case 'Show Queue':
      await handleShowQueueContextMenu(interaction, musicQueue);
      break;

    case 'Pause/Resume':
      await handlePauseResumeContextMenu(interaction, musicQueue);
      break;

    default:
      await interaction.reply({
        content: 'Unknown context menu command!',
        flags: MessageFlags.Ephemeral
      });
  }
}

/**
 * Handle "Play Song" context menu - shows modal with search bar
 */
async function handlePlaySongContextMenu(interaction) {
  // Create modal with search input
  const modal = new ModalBuilder()
    .setCustomId('play_song_modal')
    .setTitle('🎵 Play a Song');

  const songInput = new TextInputBuilder()
    .setCustomId('song_query')
    .setLabel('Song name or URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter song name, YouTube URL, or Spotify/SoundCloud link')
    .setRequired(true);

  const priorityInput = new TextInputBuilder()
    .setCustomId('priority')
    .setLabel('Add to front of queue? (yes/no)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('no')
    .setRequired(false)
    .setMaxLength(3);

  const firstRow = new ActionRowBuilder().addComponents(songInput);
  const secondRow = new ActionRowBuilder().addComponents(priorityInput);

  modal.addComponents(firstRow, secondRow);

  await interaction.showModal(modal);
}

/**
 * Handle "Skip Song" context menu
 */
async function handleSkipContextMenu(interaction, musicQueue) {
  if (!musicQueue.isPlaying) {
    const embed = createErrorEmbed('Nothing is currently playing!');
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const skippedSong = musicQueue.getCurrentSong();
  musicQueue.skip();

  const embed = createInfoEmbed('⏭️ Skipped', `Skipped **${skippedSong.title}**`);
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * Handle "Show Queue" context menu
 */
async function handleShowQueueContextMenu(interaction, musicQueue) {
  const queue = musicQueue.getQueue();
  const current = musicQueue.getCurrentSong();

  const embed = createQueueEmbed(queue, current);
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * Handle "Pause/Resume" context menu
 */
async function handlePauseResumeContextMenu(interaction, musicQueue) {
  if (!musicQueue.isPlaying && !musicQueue.getCurrentSong()) {
    const embed = createErrorEmbed('Nothing is currently playing!');
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (musicQueue.isPlaying) {
    musicQueue.pause();
    const embed = createInfoEmbed('⏸️ Paused', 'Music playback paused');
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    musicQueue.resume();
    const embed = createInfoEmbed('▶️ Resumed', 'Music playback resumed');
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

/**
 * Handle modal (form) submissions
 */
export async function handleModalSubmit(interaction, musicQueue, context) {
  const modalId = interaction.customId;

  console.log(`Modal submit: ${modalId} by ${interaction.user.username}`);

  switch (modalId) {
    case 'play_song_modal':
      await handlePlaySongModalSubmit(interaction, musicQueue, context);
      break;

    default:
      await interaction.reply({
        content: 'Unknown modal submission!',
        flags: MessageFlags.Ephemeral
      });
  }
}

/**
 * Handle "Play Song" modal submission
 */
async function handlePlaySongModalSubmit(interaction, musicQueue, context) {
  // Get form data
  const query = interaction.fields.getTextInputValue('song_query');
  const priorityText = interaction.fields.getTextInputValue('priority') || 'no';
  const priority = priorityText.toLowerCase().startsWith('y'); // yes/y = true

  console.log(`Play song modal: query="${query}", priority=${priority}`);

  // Defer reply since song lookup might take time
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const voiceChannel = context.voiceChannel;

  // Validate voice channel
  if (!voiceChannel) {
    const errorMsg = context.isDM
      ? 'You need to be in a voice channel in your last active server to play music!'
      : 'You need to be in a voice channel to play music!';
    const embed = createErrorEmbed(errorMsg);
    return interaction.editReply({ embeds: [embed] });
  }

  try {
    // Import play module dynamically to avoid circular dependencies
    const play = (await import('play-dl')).default;

    let url = query;
    let isSearchResult = false;

    // If it's not a URL, search for it
    if (!query.startsWith('http')) {
      console.log('Searching for song...');

      // Try SoundCloud first, then YouTube
      const searchSources = [
        { name: 'SoundCloud', config: { source: { soundcloud: 'tracks' }, limit: 1 } },
        { name: 'YouTube', config: { limit: 1 } }
      ];

      let searchResults = [];
      let searchSource = '';

      for (const source of searchSources) {
        try {
          searchResults = await play.search(query, source.config);
          if (searchResults.length > 0) {
            searchSource = source.name;
            console.log(`Found on ${source.name}: ${searchResults[0].title}`);
            break;
          }
        } catch (error) {
          console.log(`${source.name} search failed: ${error.message}`);
          continue;
        }
      }

      if (searchResults.length === 0) {
        const embed = createErrorEmbed(`No results found for: ${query}`);
        return interaction.editReply({ embeds: [embed] });
      }

      url = searchResults[0].url;
      isSearchResult = true;
    }

    // Add song to queue
    console.log('Adding song to queue...');
    const song = await musicQueue.addSong(url, interaction.user.id, interaction.user.username, priority);

    // Success message
    const position = musicQueue.getQueue().length + (musicQueue.isPlaying ? 1 : 0);
    const positionText = priority ? 'Next in queue' : `Position ${position}`;

    const embed = createInfoEmbed(
      '✅ Song Added',
      `**${song.title}**\n${positionText}`
    );

    await interaction.editReply({ embeds: [embed] });

    // Connect to voice if needed
    if (!musicQueue.connection) {
      console.log('Connecting to voice...');
      await musicQueue.connect(voiceChannel, interaction.channel);
    }

    // Start playing if not already
    if (!musicQueue.isPlaying) {
      console.log('Starting playback...');
      musicQueue.playNext();
    }
  } catch (error) {
    console.error('Error in play song modal:', error);
    const embed = createErrorEmbed(`Failed to play song: ${error.message}`);
    await interaction.editReply({ embeds: [embed] });
  }
}

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Vintage radio theme colors - warm wooden radio aesthetic
const RADIO_COLORS = {
  primary: 0x8B4513,      // Saddle Brown - classic wood
  playing: 0xD4AF37,      // Metallic Gold - radio dial
  radio: 0xCD853F,        // Peru - warm wood tone
  success: 0xDAA520,      // Goldenrod - vintage yellow
  error: 0xB22222,        // Fire Brick - classic red
  queue: 0xA0826D,        // Wood Brown - speaker grille
  accent: 0xFFD700        // Gold - highlights
};

// Format duration from seconds to MM:SS
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Create vintage radio dial progress bar
function createProgressBar(current, total, length = 15) {
  if (!total || total === 0) return '░'.repeat(length);
  const progress = Math.floor((current / total) * length);
  return '▰'.repeat(progress) + '▱'.repeat(length - progress);
}

// Vintage radio decorative border
function createRadioBorder() {
  return '═══════════════════════════════';
}

// Vintage frequency display
function createFrequencyDisplay(text) {
  return `╔═══ ${text} ═══╗`;
}

export function createNowPlayingEmbed(song, isRadio = false) {
  const stationMode = isRadio ? '📻 RADIO MODE' : '♫ DIRECT PLAY';
  const border = createRadioBorder();

  const description = [
    border,
    ``,
    `**♫ ${song.title.toUpperCase()}**`,
    ``,
    `🎙️ **${song.artist || 'Unknown Artist'}**`,
    ``,
    border
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(isRadio ? RADIO_COLORS.radio : RADIO_COLORS.playing)
    .setAuthor({
      name: `${stationMode} • ON AIR`,
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    })
    .setDescription(description)
    .addFields(
      {
        name: '⏱️ Duration',
        value: `\`${formatDuration(song.duration)}\``,
        inline: true
      },
      {
        name: '🎧 Requested By',
        value: `\`${song.requestedBy.name}\``,
        inline: true
      }
    )
    .setFooter({
      text: `ECHO'S ANVIL RADIO • Est. 2024 • Broadcasting Live`,
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/musical-note_1f3b5.png'
    })
    .setTimestamp();

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  return embed;
}

export function createQueueEmbed(queue, currentSong) {
  const border = createRadioBorder();

  const embed = new EmbedBuilder()
    .setColor(RADIO_COLORS.queue)
    .setAuthor({
      name: '📻 PROGRAM SCHEDULE',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/clipboard_1f4cb.png'
    })
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Broadcasting Schedule',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });

  if (currentSong) {
    const nowPlayingText = [
      `${border}`,
      `**▶ ON AIR NOW**`,
      `**${currentSong.title}**`,
      `🎙️ ${currentSong.artist}`,
      `🎧 Requested by ${currentSong.requestedBy.name}`,
      `${border}`
    ].join('\n');

    embed.addFields({
      name: '\u200B',
      value: nowPlayingText,
      inline: false
    });
  }

  if (queue.length === 0) {
    embed.setDescription('```\n═══════════════════════════════\n  NO SCHEDULED PROGRAMS\n  Add songs with /play\n  or tune to /radio mode\n═══════════════════════════════```');
  } else {
    const queueList = queue.slice(0, 10).map((song, index) =>
      `**${index + 1}.** ${song.title}\n   🎙️ ${song.artist} • ⏱️ ${formatDuration(song.duration)}\n   🎧 ${song.requestedBy.name}`
    ).join('\n\n');

    embed.setDescription(queueList);

    if (queue.length > 10) {
      embed.addFields({
        name: '📡 Extended Broadcast',
        value: `*...and ${queue.length - 10} more programs scheduled*`,
        inline: false
      });
    }

    // Calculate total duration
    const totalDuration = queue.reduce((sum, song) => sum + (song.duration || 0), 0);
    embed.addFields({
      name: '⏰ Broadcast Info',
      value: `\`\`\`\nScheduled Programs: ${queue.length}\nTotal Airtime: ${formatDuration(totalDuration)}\`\`\``,
      inline: false
    });
  }

  return embed;
}

export function createPlaybackButtons(isPlaying = true, isPaused = false) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pause')
        .setLabel(isPaused ? 'Resume' : 'Pause')
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!isPlaying),
      new ButtonBuilder()
        .setCustomId('skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isPlaying),
      new ButtonBuilder()
        .setCustomId('queue')
        .setLabel('View Queue')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('radio')
        .setLabel('Radio')
        .setEmoji('📻')
        .setStyle(ButtonStyle.Success)
    );

  return row;
}

export function createSongAddedEmbed(song, position, priority = false) {
  const border = createRadioBorder();
  const status = priority ? '⚡ PRIORITY BROADCAST' : '📻 SCHEDULED';

  const description = [
    border,
    `**${song.title}**`,
    `🎙️ ${song.artist || 'Unknown Artist'}`,
    border
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(priority ? RADIO_COLORS.accent : RADIO_COLORS.success)
    .setAuthor({
      name: `${status}`,
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/check-mark-button_2705.png'
    })
    .setDescription(description)
    .addFields(
      { name: '⏱️ Duration', value: `\`${formatDuration(song.duration)}\``, inline: true },
      { name: '📍 Position', value: priority ? '`Next Up!`' : `\`#${position}\``, inline: true }
    )
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Program Added',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  return embed;
}

export function createPlaylistAddedEmbed(playlistTitle, totalSongs) {
  const border = createRadioBorder();

  const description = [
    border,
    `📻 **BROADCAST SERIES ADDED**`,
    ``,
    `**${playlistTitle}**`,
    ``,
    `\`${totalSongs} programs scheduled\``,
    border
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(RADIO_COLORS.success)
    .setAuthor({
      name: '📡 PROGRAMMING BLOCK SCHEDULED',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/videocassette_1f4fc.png'
    })
    .setDescription(description)
    .addFields(
      { name: '🎵 Total Programs', value: `\`${totalSongs}\``, inline: true },
      { name: '💾 Status', value: '`All Tracked`', inline: true }
    )
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Series Added to Schedule',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });

  return embed;
}

export function createRadioModeEmbed(enabled, userCount = 0) {
  const border = createRadioBorder();

  const embed = new EmbedBuilder()
    .setColor(RADIO_COLORS.radio)
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Your Vintage Music Station',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });

  if (enabled) {
    const description = [
      border,
      `📻 **STATION NOW BROADCASTING**`,
      ``,
      `*Tuned to your personalized frequency*`,
      ``,
      `Songs curated from listener preferences`,
      `Higher demand = More airtime`,
      border
    ].join('\n');

    embed
      .setAuthor({
        name: '📻 RADIO MODE: ON AIR',
        iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/antenna-bars_1f4f6.png'
      })
      .setDescription(description);

    if (userCount > 0) {
      embed.addFields({
        name: '👥 Tuned In',
        value: `\`\`\`\n${userCount} ${userCount === 1 ? 'Listener' : 'Listeners'}\n\`\`\``,
        inline: true
      });
    }

    embed.addFields({
      name: '📡 Broadcast Features',
      value: '```\n• Weighted song selection\n• Priority requests honored\n• Live listener tracking\n```',
      inline: false
    });
  } else {
    const description = [
      border,
      `📻 **STATION OFF AIR**`,
      ``,
      `*Broadcasting has been suspended*`,
      ``,
      `Manual queue mode active`,
      border
    ].join('\n');

    embed
      .setAuthor({
        name: '📻 RADIO MODE: OFF AIR',
        iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/cross-mark_274c.png'
      })
      .setDescription(description);
  }

  return embed;
}

export function createStatsEmbed(stats) {
  const border = createRadioBorder();

  const description = [
    border,
    `📻 **BROADCASTING SINCE 2024**`,
    `*Your Vintage Music Station*`,
    border
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(RADIO_COLORS.primary)
    .setAuthor({
      name: '📊 STATION STATISTICS',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/bar-chart_1f4ca.png'
    })
    .setDescription(description)
    .addFields(
      {
        name: '👥 Total Listeners',
        value: `\`\`\`\n${stats.uniqueUsers}\n\`\`\``,
        inline: true
      },
      {
        name: '🎵 Music Library',
        value: `\`\`\`\n${stats.trackedSongs}\n\`\`\``,
        inline: true
      },
      {
        name: '▶️ Broadcasts',
        value: `\`\`\`\n${stats.totalPlays}\n\`\`\``,
        inline: true
      }
    )
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Broadcasting Your Favorites',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });

  return embed;
}

export function createUserSongsEmbed(userName, songs) {
  const border = createRadioBorder();

  const embed = new EmbedBuilder()
    .setColor(RADIO_COLORS.primary)
    .setAuthor({
      name: `📻 ${userName.toUpperCase()}'S REQUEST HISTORY`,
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/musical-note_1f3b5.png'
    })
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Listener Profile',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });

  if (songs.length === 0) {
    const description = [
      border,
      `📻 **NO REQUESTS ON FILE**`,
      ``,
      `*Tune in and make your first request!*`,
      border
    ].join('\n');
    embed.setDescription(description);
  } else {
    const songList = songs.map((song, index) =>
      `**${index + 1}.** ${song.song_title}\n   🎙️ ${song.song_artist || 'Unknown'} • **${song.request_count}** request${song.request_count !== 1 ? 's' : ''}`
    ).join('\n\n');

    embed.setDescription(songList);

    const totalRequests = songs.reduce((sum, song) => sum + song.request_count, 0);
    embed.addFields({
      name: '📊 Listener Profile',
      value: `\`\`\`\nUnique Songs: ${songs.length}\nTotal Requests: ${totalRequests}\`\`\``,
      inline: false
    });
  }

  return embed;
}

export function createErrorEmbed(message) {
  const border = createRadioBorder();

  const description = [
    border,
    `⚠️ **TECHNICAL DIFFICULTIES**`,
    ``,
    message,
    border
  ].join('\n');

  return new EmbedBuilder()
    .setColor(RADIO_COLORS.error)
    .setAuthor({
      name: '📻 BROADCAST INTERRUPTION',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/warning_26a0-fe0f.png'
    })
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Please Stand By',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });
}

export function createInfoEmbed(title, message) {
  const border = createRadioBorder();

  const description = [
    border,
    message,
    border
  ].join('\n');

  return new EmbedBuilder()
    .setColor(RADIO_COLORS.primary)
    .setAuthor({
      name: `📻 ${title.toUpperCase()}`,
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/information_2139-fe0f.png'
    })
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: 'ECHO\'S ANVIL RADIO • Station Announcement',
      iconURL: 'https://em-content.zobj.net/thumbs/120/twitter/348/radio_1f4fb.png'
    });
}

import { createErrorEmbed } from './radioEmbeds.js';

/**
 * Resolves the context for an interaction, handling both guild and DM contexts
 * @param {Interaction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Map} userLastGuild - Map tracking user's last active guild
 * @returns {Promise<Object>} { guildId, voiceChannel, member, isDM }
 */
export async function resolveDMContext(interaction, client, userLastGuild) {
  // If it's a guild interaction, use existing logic
  if (interaction.guildId) {
    return {
      guildId: interaction.guildId,
      voiceChannel: interaction.member?.voice?.channel || null,
      member: interaction.member,
      isDM: false
    };
  }

  // It's a DM interaction
  const userId = interaction.user.id;

  // Check if user has a last active guild
  const lastGuildId = userLastGuild.get(userId);

  if (!lastGuildId) {
    await interaction.reply({
      embeds: [createErrorEmbed(
        'No recent server activity detected!\n\n' +
        'Please run a command in a server first, then you can use DMs.'
      )],
      ephemeral: true
    });
    return { guildId: null };
  }

  // Verify guild still exists and bot is in it
  const guild = await client.guilds.fetch(lastGuildId).catch(() => null);

  if (!guild) {
    userLastGuild.delete(userId); // Clean up invalid entry
    await interaction.reply({
      embeds: [createErrorEmbed(
        'Your last active server is no longer available.\n\n' +
        'Please run a command in a server first.'
      )],
      ephemeral: true
    });
    return { guildId: null };
  }

  // Fetch user's voice state in that guild
  const voiceChannel = await getUserVoiceStateInGuild(client, userId, lastGuildId);

  // Fetch guild member object
  const member = await guild.members.fetch(userId).catch(() => null);

  if (!member) {
    userLastGuild.delete(userId);
    await interaction.reply({
      embeds: [createErrorEmbed(
        'You are no longer a member of your last active server.\n\n' +
        'Please run a command in a server you are currently in.'
      )],
      ephemeral: true
    });
    return { guildId: null };
  }

  return {
    guildId: lastGuildId,
    voiceChannel,
    member,
    isDM: true
  };
}

/**
 * Gets user's voice channel in a specific guild
 * @param {Client} client - Discord client
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @returns {Promise<VoiceChannel|null>} Voice channel or null
 */
export async function getUserVoiceStateInGuild(client, userId, guildId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.voice.channel;
  } catch (error) {
    console.error('Error fetching voice state:', error);
    return null;
  }
}

/**
 * Updates user's last active guild
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Map} userLastGuild - Map to update
 */
export function updateUserGuildTracking(userId, guildId, userLastGuild) {
  userLastGuild.set(userId, guildId);
}

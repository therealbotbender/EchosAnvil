import { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType } from '@discordjs/voice';
import play from 'play-dl';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { trackUserSong, recordListeningHistory, getMultipleUsersSongs, rateSong } from './database.js';
import { createNowPlayingEmbed, createPlaybackButtons, createInfoEmbed } from './radioEmbeds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class MusicQueue {
  constructor() {
    this.queue = [];
    this.currentSong = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.subscription = null; // Store the subscription to prevent garbage collection
    this.isPlaying = false;
    this.textChannel = null;
    this.voiceChannel = null;
    this.radioMode = false;
    this.discoveryMode = false;
    this.activeUsers = new Set();
    this.recentlyPlayed = []; // Adaptive history: up to 60% of library or 50 songs
    this.recentArtists = []; // Adaptive history: up to 15% of library or 10 artists
    this.crossfadeDuration = 3000; // 3 seconds crossfade
    this.currentVolume = 1.0; // Track current volume level
    this.fadeInterval = null; // Track active fade interval
    this.botMessages = []; // Track bot messages for cleanup

    this.setupPlayerEvents();
  }

  setupPlayerEvents() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.isPlaying = false;
      this.clearFadeInterval();
      this.currentVolume = 1.0;
      this.playNext();
    });

    this.player.on('error', error => {
      console.error('Audio player error:', error);
      this.isPlaying = false;
      this.clearFadeInterval();
      this.currentVolume = 1.0;
      if (this.textChannel) {
        this.textChannel.send(`Error playing song: ${error.message}`).catch(console.error);
      }
      this.playNext();
    });
  }

  clearFadeInterval() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
  }

  async fadeOutAndSkip() {
    return new Promise((resolve) => {
      // Clear any existing fade
      this.clearFadeInterval();

      const fadeSteps = 20; // Number of volume steps
      const stepDuration = this.crossfadeDuration / fadeSteps; // ms per step
      let currentStep = 0;

      this.fadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = Math.max(0, 1 - (currentStep / fadeSteps));
        this.currentVolume = newVolume;

        // Set volume on current resource if available
        if (this.player.state.status === AudioPlayerStatus.Playing &&
            this.player.state.resource &&
            this.player.state.resource.volume) {
          this.player.state.resource.volume.setVolume(newVolume);
        }

        if (currentStep >= fadeSteps) {
          this.clearFadeInterval();
          this.player.stop(); // Stop after fade completes
          resolve();
        }
      }, stepDuration);
    });
  }

  async fadeIn() {
    // Clear any existing fade
    this.clearFadeInterval();

    const fadeSteps = 20;
    const stepDuration = this.crossfadeDuration / fadeSteps;
    let currentStep = 0;

    // Start at 0 volume
    this.currentVolume = 0;
    if (this.player.state.status === AudioPlayerStatus.Playing &&
        this.player.state.resource &&
        this.player.state.resource.volume) {
      this.player.state.resource.volume.setVolume(0);
    }

    this.fadeInterval = setInterval(() => {
      currentStep++;
      const newVolume = Math.min(1, currentStep / fadeSteps);
      this.currentVolume = newVolume;

      if (this.player.state.status === AudioPlayerStatus.Playing &&
          this.player.state.resource &&
          this.player.state.resource.volume) {
        this.player.state.resource.volume.setVolume(newVolume);
      }

      if (currentStep >= fadeSteps) {
        this.clearFadeInterval();
      }
    }, stepDuration);
  }

  async connect(voiceChannel, textChannel) {
    try {
      this.voiceChannel = voiceChannel;
      this.textChannel = textChannel;

      console.log(`Attempting to join voice channel: ${voiceChannel.name}`);

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });

      this.connection = connection;

      console.log(`Voice connection created, initial status: ${this.connection.state.status}`);

      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        console.log('Voice connection disconnected, attempting to reconnect...');
        try {
          await Promise.race([
            entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          console.error('Failed to reconnect:', error);
          this.connection.destroy();
          this.cleanup();
        }
      });

      this.connection.on(VoiceConnectionStatus.Connecting, () => {
        console.log('Voice connection status: Connecting...');
      });

      this.connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('Voice connection status: Ready!');
      });

      this.connection.on('error', (error) => {
        console.error('Voice connection error:', error);
      });

      // Try to wait for ready state with more lenient handling
      try {
        console.log('Waiting for voice connection to be ready...');
        await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
        console.log('Voice connection ready!');
      } catch (error) {
        console.error('Timeout waiting for Ready state:', error.message);
        console.log(`Current connection status: ${this.connection.state.status}`);

        // Clean up and throw error - don't try to proceed with a broken connection
        if (this.connection) {
          this.connection.destroy();
          this.connection = null;
        }

        throw new Error(`Failed to connect to Discord voice servers. This is likely a network/firewall issue. Error: ${error.message}`);
      }

      this.subscription = this.connection.subscribe(this.player);
      console.log('Player subscribed to voice connection');

      this.updateActiveUsers();

      return true;
    } catch (error) {
      console.error('Failed to connect to voice channel:', error);
      if (this.connection) {
        this.connection.destroy();
        this.connection = null;
      }
      return false;
    }
  }

  updateActiveUsers() {
    if (!this.voiceChannel) return;

    this.activeUsers.clear();
    this.voiceChannel.members.forEach(member => {
      if (!member.user.bot) {
        this.activeUsers.add(member.user.id);
      }
    });
  }

  async getVideoInfoWithYtDlp(url) {
    // Use yt-dlp to get video info with age verification bypass
    const { spawn } = await import('child_process');
    const { existsSync } = await import('fs');
    const platform = process.platform;
    let ytdlpPath;

    if (platform === 'win32') {
      ytdlpPath = join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
    } else {
      ytdlpPath = join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
    }

    // Build arguments with cookie support
    const args = [
      url,
      '-J', // Output JSON metadata
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=android',
      '--age-limit', '0'
    ];

    // Cookie support (priority order: env string > file > browser)
    if (process.env.YOUTUBE_COOKIES) {
      // Option 1: Cookie string from environment variable (best for Docker/Portainer)
      console.log('Using YouTube cookies from environment variable');
      const { writeFileSync, unlinkSync } = await import('fs');
      const tempCookiePath = join(__dirname, '..', '.temp-cookies.txt');
      try {
        writeFileSync(tempCookiePath, process.env.YOUTUBE_COOKIES);
        args.push('--cookies', tempCookiePath);
        // Clean up temp file after spawn
        setTimeout(() => {
          try { unlinkSync(tempCookiePath); } catch (e) { /* ignore */ }
        }, 1000);
      } catch (error) {
        console.error('Failed to write temp cookies file:', error);
      }
    } else {
      // Option 2: Check for cookies file (supports both .txt and Netscape format)
      const cookiesPath = process.env.YOUTUBE_COOKIES_FILE || join(__dirname, '..', 'cookies.txt');
      if (existsSync(cookiesPath)) {
        console.log(`Using YouTube cookies from: ${cookiesPath}`);
        args.push('--cookies', cookiesPath);
      } else if (process.env.YOUTUBE_COOKIES_BROWSER) {
        // Option 3: Try to use cookies from browser if specified
        console.log(`Attempting to use cookies from browser: ${process.env.YOUTUBE_COOKIES_BROWSER}`);
        args.push('--cookies-from-browser', process.env.YOUTUBE_COOKIES_BROWSER);
      }
    }

    return new Promise((resolve, reject) => {
      const ytdlp = spawn(ytdlpPath, args);

      let jsonOutput = '';
      let errorOutput = '';

      ytdlp.stdout.on('data', (data) => {
        jsonOutput += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Failed to get video info: ${errorOutput}`));
        }

        try {
          const metadata = JSON.parse(jsonOutput);
          // Convert to play-dl format for compatibility
          const videoDetails = {
            url: metadata.webpage_url || metadata.url,
            title: metadata.title,
            channel: { name: metadata.uploader || metadata.channel || 'Unknown' },
            durationInSec: metadata.duration || 0,
            thumbnails: metadata.thumbnails ? [{ url: metadata.thumbnail }] : []
          };
          resolve({ video_details: videoDetails });
        } catch (error) {
          reject(new Error(`Failed to parse video info: ${error.message}`));
        }
      });

      ytdlp.on('error', (error) => {
        reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
      });
    });
  }

  async addSong(url, userId, userName, priority = false) {
    try {
      let songInfo;

      // Convert YouTube Music URLs to regular YouTube URLs
      if (url.includes('music.youtube.com')) {
        url = url.replace('music.youtube.com', 'www.youtube.com');
      }

      // Determine source type
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      const isSoundCloud = url.includes('soundcloud.com');
      const isSpotify = url.includes('spotify.com');
      const isDeezer = url.includes('deezer.com');

      if (isYouTube) {
        // If it's a playlist URL, only get the first video
        if (url.includes('list=')) {
          const playlistInfo = await play.playlist_info(url, { incomplete: true });
          const videos = await playlistInfo.all_videos();

          if (videos.length === 0) {
            throw new Error('Playlist is empty. Use /playlist command to add entire playlists.');
          }

          // Get only the first video
          const firstVideo = videos[0];
          const song = {
            url: firstVideo.url,
            title: firstVideo.title,
            artist: firstVideo.channel?.name || 'Unknown',
            duration: firstVideo.durationInSec,
            requestedBy: { id: userId, name: userName },
            thumbnail: firstVideo.thumbnails[0]?.url
          };

          trackUserSong(userId, userName, song.url, song.title, song.artist);

          if (priority) {
            this.queue.unshift(song);
          } else {
            this.queue.push(song);
          }

          if (this.textChannel) {
            this.textChannel.send(
              `ℹ️ Playlist URL detected - added only the first song. Use \`/playlist\` to add entire playlists.`
            ).catch(console.error);
          }

          return song;
        }

        // Regular single video URL
        songInfo = await this.getVideoInfoWithYtDlp(url);
        const videoDetails = songInfo.video_details;

        const song = {
          url: videoDetails.url,
          title: videoDetails.title,
          artist: videoDetails.channel?.name || 'Unknown',
          duration: videoDetails.durationInSec,
          requestedBy: { id: userId, name: userName },
          thumbnail: videoDetails.thumbnails[0]?.url
        };

        trackUserSong(userId, userName, song.url, song.title, song.artist);

        if (priority) {
          this.queue.unshift(song);
        } else {
          this.queue.push(song);
        }

        return song;
      } else if (isSoundCloud) {
        // Handle SoundCloud URLs
        const soundcloudInfo = await play.soundcloud(url);

        const song = {
          url: soundcloudInfo.url,
          title: soundcloudInfo.name,
          artist: soundcloudInfo.user?.name || 'Unknown',
          duration: soundcloudInfo.durationInSec,
          requestedBy: { id: userId, name: userName },
          thumbnail: soundcloudInfo.thumbnail
        };

        trackUserSong(userId, userName, song.url, song.title, song.artist);

        if (priority) {
          this.queue.unshift(song);
        } else {
          this.queue.push(song);
        }

        return song;
      } else if (isSpotify) {
        // Handle Spotify URLs - note: Spotify requires fetching from YouTube for actual audio
        const spotifyInfo = await play.spotify(url);

        // Search for the song on YouTube to get playable audio
        const searchQuery = `${spotifyInfo.name} ${spotifyInfo.artists?.[0]?.name || ''}`;
        const searchResults = await play.search(searchQuery, { limit: 1 });

        if (searchResults.length === 0) {
          throw new Error('Could not find playable version of Spotify track');
        }

        const youtubeUrl = searchResults[0].url;
        const videoInfo = await this.getVideoInfoWithYtDlp(youtubeUrl);
        const videoDetails = videoInfo.video_details;

        const song = {
          url: videoDetails.url,
          title: spotifyInfo.name,
          artist: spotifyInfo.artists?.[0]?.name || 'Unknown',
          duration: videoDetails.durationInSec,
          requestedBy: { id: userId, name: userName },
          thumbnail: spotifyInfo.thumbnail?.url || videoDetails.thumbnails[0]?.url
        };

        trackUserSong(userId, userName, song.url, song.title, song.artist);

        if (priority) {
          this.queue.unshift(song);
        } else {
          this.queue.push(song);
        }

        return song;
      } else if (isDeezer) {
        // Handle Deezer URLs - similar to Spotify, requires YouTube for audio
        const deezerInfo = await play.deezer(url);

        // Search for the song on YouTube to get playable audio
        const searchQuery = `${deezerInfo.title} ${deezerInfo.artist?.name || ''}`;
        const searchResults = await play.search(searchQuery, { limit: 1 });

        if (searchResults.length === 0) {
          throw new Error('Could not find playable version of Deezer track');
        }

        const youtubeUrl = searchResults[0].url;
        const videoInfo = await this.getVideoInfoWithYtDlp(youtubeUrl);
        const videoDetails = videoInfo.video_details;

        const song = {
          url: videoDetails.url,
          title: deezerInfo.title,
          artist: deezerInfo.artist?.name || 'Unknown',
          duration: videoDetails.durationInSec,
          requestedBy: { id: userId, name: userName },
          thumbnail: deezerInfo.thumbnail || videoDetails.thumbnails[0]?.url
        };

        trackUserSong(userId, userName, song.url, song.title, song.artist);

        if (priority) {
          this.queue.unshift(song);
        } else {
          this.queue.push(song);
        }

        return song;
      } else {
        throw new Error('Unsupported URL. Please use YouTube, SoundCloud, Spotify, or Deezer URLs.');
      }
    } catch (error) {
      console.error('Error adding song:', error);
      throw error;
    }
  }

  async addPlaylist(playlistUrl, userId, userName) {
    try {
      // Convert YouTube Music URLs to regular YouTube URLs
      if (playlistUrl.includes('music.youtube.com')) {
        playlistUrl = playlistUrl.replace('music.youtube.com', 'www.youtube.com');
      }

      // Check if it's a playlist URL
      if (!playlistUrl.includes('list=')) {
        throw new Error('Invalid playlist URL. Make sure it contains "list=" parameter.');
      }

      const playlistInfo = await play.playlist_info(playlistUrl, { incomplete: true });
      const videos = await playlistInfo.all_videos();

      if (videos.length === 0) {
        throw new Error('Playlist is empty or could not be loaded.');
      }

      const addedSongs = [];

      for (const video of videos) {
        try {
          const song = {
            url: video.url,
            title: video.title,
            artist: video.channel?.name || 'Unknown',
            duration: video.durationInSec,
            requestedBy: { id: userId, name: userName },
            thumbnail: video.thumbnails[0]?.url
          };

          trackUserSong(userId, userName, song.url, song.title, song.artist);
          this.queue.push(song);
          addedSongs.push(song);
        } catch (videoError) {
          console.error(`Failed to add video: ${video.title}`, videoError);
        }
      }

      // If radio mode is playing, interrupt it to start the playlist
      if (this.radioMode && this.isPlaying && this.currentSong?.requestedBy.id === 'radio') {
        if (this.textChannel) {
          this.textChannel.send('🎵 Interrupting radio to play your playlist!').catch(console.error);
        }
        this.skip();
      }

      return {
        playlistTitle: playlistInfo.title,
        totalSongs: addedSongs.length,
        songs: addedSongs
      };
    } catch (error) {
      console.error('Error adding playlist:', error);
      throw error;
    }
  }

  async playSong(song) {
    try {
      // Validate song object
      if (!song || !song.url) {
        console.error('Invalid song object:', song);
        throw new Error('Song object is missing URL');
      }

      console.log(`Playing song: ${song.title} - ${song.url}`);

      this.currentSong = song;
      this.isPlaying = true;

      // Validate URL before streaming
      if (!song.url || song.url === 'undefined' || song.url.trim() === '') {
        throw new Error(`Invalid URL for song: ${song.title}`);
      }

      // Use yt-dlp for streaming
      await this.playWithLocalStream(song);

      // Fade in the new song
      await this.fadeIn();

      this.activeUsers.forEach(userId => {
        recordListeningHistory(userId, song.url, song.title);
      });

      if (this.textChannel) {
        // Delete previous message before sending new one
        if (this.botMessages.length > 0) {
          const previousMessage = this.botMessages[this.botMessages.length - 1];
          try {
            await previousMessage.delete();
          } catch (error) {
            console.log('Could not delete previous message:', error.message);
          }
          this.botMessages.pop(); // Remove from tracking
        }

        const isRadioSong = song.requestedBy.id === 'radio';
        const embed = createNowPlayingEmbed(song, isRadioSong);
        const buttons = createPlaybackButtons(true, false);

        this.textChannel.send({
          embeds: [embed],
          components: [buttons]
        }).then(async (message) => {
          // Track this message (only keeping the latest one)
          this.botMessages.push(message);

          // Add reaction emojis
          try {
            await message.react('👍');
            await message.react('👎');

            // Create reaction collector
            const filter = (reaction, user) => {
              return ['👍', '👎'].includes(reaction.emoji.name) && !user.bot;
            };

            const collector = message.createReactionCollector({ filter, time: 300000 }); // 5 minutes

            collector.on('collect', (reaction, user) => {
              console.log(`${user.username} reacted with ${reaction.emoji.name} to ${song.title}`);

              // Track the rating
              const rating = reaction.emoji.name === '👍' ? 1 : -1;
              rateSong(user.id, song.url, song.title, rating, user.username);

              if (rating === 1) {
                console.log(`✓ Added ${song.title} to ${user.username}'s profile`);
              }
            });

            collector.on('end', () => {
              console.log('Reaction collector ended for:', song.title);
            });
          } catch (error) {
            console.error('Error adding reactions:', error);
          }
        }).catch(console.error);
      }

      return true;
    } catch (error) {
      console.error('Error playing song:', error);
      this.isPlaying = false;

      if (this.textChannel) {
        this.textChannel.send(`❌ Failed to play: ${song?.title || 'Unknown song'}. Skipping...`).catch(console.error);
      }

      // Skip to next song instead of crashing
      setTimeout(() => this.playNext(), 1000);
      return false;
    }
  }

  async playWithLocalStream(song) {
    // Check if it's a SoundCloud URL - use play-dl's native streaming
    if (song.url.includes('soundcloud.com')) {
      console.log('🎵 Using play-dl for SoundCloud streaming...');

      try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
          inputType: stream.type,
          inlineVolume: true
        });

        this.player.play(resource);
        console.log('✓ Streaming audio from SoundCloud');
        return;
      } catch (error) {
        console.error('SoundCloud streaming failed:', error);
        throw new Error(`Failed to stream from SoundCloud: ${error.message}`);
      }
    }

    // For YouTube and other sources, use yt-dlp
    console.log('🎵 Using yt-dlp for streaming...');

    // Use yt-dlp directly via spawn - pipe audio directly to Discord
    const { spawn } = await import('child_process');
    const { existsSync } = await import('fs');

    // Determine the correct yt-dlp binary based on platform
    const platform = process.platform;
    let ytdlpPath;

    if (platform === 'win32') {
      ytdlpPath = join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
    } else {
      ytdlpPath = join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
    }

    console.log(`Platform: ${platform}, Using yt-dlp at: ${ytdlpPath}`);

    // Build arguments with cookie support
    const args = [
      song.url,
      '-f', 'bestaudio[ext=webm]/bestaudio/best',
      '-o', '-', // Output to stdout
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=android',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Sec-Fetch-Mode:navigate',
      '--age-limit', '0' // Bypass age verification
    ];

    // Cookie support (priority order: env string > file > browser)
    if (process.env.YOUTUBE_COOKIES) {
      // Option 1: Cookie string from environment variable (best for Docker/Portainer)
      console.log('Using YouTube cookies from environment variable');
      const { writeFileSync, unlinkSync } = await import('fs');
      const tempCookiePath = join(__dirname, '..', '.temp-cookies-stream.txt');
      try {
        writeFileSync(tempCookiePath, process.env.YOUTUBE_COOKIES);
        args.push('--cookies', tempCookiePath);
        // Clean up temp file after stream starts
        setTimeout(() => {
          try { unlinkSync(tempCookiePath); } catch (e) { /* ignore */ }
        }, 2000);
      } catch (error) {
        console.error('Failed to write temp cookies file:', error);
      }
    } else {
      // Option 2: Check for cookies file (supports both .txt and Netscape format)
      const cookiesPath = process.env.YOUTUBE_COOKIES_FILE || join(__dirname, '..', 'cookies.txt');
      if (existsSync(cookiesPath)) {
        console.log(`Using YouTube cookies from: ${cookiesPath}`);
        args.push('--cookies', cookiesPath);
      } else if (process.env.YOUTUBE_COOKIES_BROWSER) {
        // Option 3: Try to use cookies from browser if specified
        console.log(`Attempting to use cookies from browser: ${process.env.YOUTUBE_COOKIES_BROWSER}`);
        args.push('--cookies-from-browser', process.env.YOUTUBE_COOKIES_BROWSER);
      }
    }

    return new Promise((resolve, reject) => {
      // Spawn yt-dlp to output audio to stdout
      const ytdlp = spawn(ytdlpPath, args);

      let errorOutput = '';
      let hasResolved = false;

      ytdlp.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.log('yt-dlp stderr:', message.trim());
      });

      ytdlp.on('error', (err) => {
        console.error('yt-dlp spawn error:', err);
        if (!hasResolved) {
          hasResolved = true;
          return reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        }
      });

      ytdlp.on('close', (code) => {
        if (code !== 0 && code !== null && !hasResolved) {
          console.error('yt-dlp exited with code:', code);
          console.error('yt-dlp full stderr:', errorOutput);
          hasResolved = true;
          return reject(new Error(`yt-dlp exited with code ${code}: ${errorOutput}`));
        }
      });

      // Wait a moment for yt-dlp to start outputting data
      ytdlp.stdout.once('readable', () => {
        try {
          if (hasResolved) return;
          hasResolved = true;

          // Create audio resource from yt-dlp's stdout stream
          const resource = createAudioResource(ytdlp.stdout, {
            inlineVolume: true,
            inputType: StreamType.Arbitrary
          });

          this.player.play(resource);
          console.log('✓ Streaming audio from yt-dlp');
          resolve();
        } catch (error) {
          if (!hasResolved) {
            hasResolved = true;
            reject(new Error(`Failed to create audio resource: ${error.message}`));
          }
        }
      });

      // Timeout after 15 seconds if no data received (increased from 10)
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          console.error('yt-dlp timeout after 15 seconds');
          console.error('Last stderr output:', errorOutput);
          hasResolved = true;
          ytdlp.kill();
          reject(new Error(`yt-dlp timeout - no audio data received. Error: ${errorOutput || 'No error output'}`));
        }
      }, 15000);

      // Clear timeout if we successfully start playing
      ytdlp.stdout.once('readable', () => {
        clearTimeout(timeout);
      });
    });
  }

  async playNext() {
    // Fade out current song if playing
    if (this.isPlaying && this.currentSong) {
      console.log('Fading out current song...');
      await this.fadeOutAndSkip();
      // Small delay to allow the fade to complete smoothly
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.queue.length > 0) {
      const nextSong = this.queue.shift();
      console.log(`Playing next song from queue. Remaining in queue: ${this.queue.length}`);
      await this.playSong(nextSong);
    } else if (this.radioMode) {
      console.log('Queue empty, playing radio song...');
      // Discovery mode: alternate between known songs and discoveries
      if (this.discoveryMode && Math.random() < 0.3) { // 30% chance for discovery
        await this.playDiscoverySong();
      } else {
        await this.playRadioSong();
      }
    } else {
      this.currentSong = null;
      console.log('Queue empty and radio mode off');
      if (this.textChannel) {
        this.textChannel.send('Queue is empty! Add more songs with `/play` or enable radio mode with `/radio on`').catch(console.error);
      }
    }
  }

  async playRadioSong() {
    try {
      this.updateActiveUsers();
      const userIds = Array.from(this.activeUsers);

      if (userIds.length === 0) {
        if (this.textChannel) {
          this.textChannel.send('No users in voice channel. Radio mode paused.').catch(console.error);
        }
        return;
      }

      const songs = getMultipleUsersSongs(userIds, 100);

      if (songs.length === 0) {
        if (this.textChannel) {
          this.textChannel.send('No songs in radio database yet! Request some songs first with `/play`').catch(console.error);
        }
        this.radioMode = false;
        return;
      }

      console.log(`\n=== Radio Selection Debug ===`);
      console.log(`Total songs in library: ${songs.length}`);
      console.log(`Recent history size: ${this.recentlyPlayed.length} songs, ${this.recentArtists.length} artists`);

      // Adaptive history size based on library size
      const maxHistorySize = Math.min(Math.floor(songs.length * 0.6), 50); // Up to 60% of library or 50 songs
      const maxArtistHistory = Math.min(Math.floor(songs.length * 0.15), 10); // Up to 15% or 10 artists

      // Filter out recently played songs
      const recentUrls = new Set(this.recentlyPlayed);
      let availableSongs = songs.filter(song => !recentUrls.has(song.song_url));

      console.log(`After filtering recent songs: ${availableSongs.length} available`);

      // Only apply artist filtering if we have enough songs left
      let diverseSongs = availableSongs;

      // Only filter by artist if we have at least 20% of library available after song filtering
      if (availableSongs.length >= Math.max(songs.length * 0.2, 10)) {
        const recentArtistSet = new Set(this.recentArtists);
        const artistFiltered = availableSongs.filter(song =>
          !recentArtistSet.has(song.song_artist) || song.song_artist === 'Unknown'
        );

        // Only use artist filtering if it leaves us with at least 30% of available songs
        if (artistFiltered.length >= availableSongs.length * 0.3) {
          diverseSongs = artistFiltered;
          console.log(`After filtering recent artists: ${diverseSongs.length} available`);
        } else {
          console.log(`Skipping artist filter (would leave only ${artistFiltered.length} songs)`);
        }
      } else {
        console.log(`Skipping artist filter (only ${availableSongs.length} songs available)`);
      }

      // Smart history management
      let justCleared = false;
      if (diverseSongs.length === 0) {
        console.log('No songs available after filtering, resetting history...');
        justCleared = true;

        // Keep only the most recent 20% to prevent immediate repeats
        const keepRecent = Math.max(3, Math.floor(this.recentlyPlayed.length * 0.2));
        this.recentlyPlayed = this.recentlyPlayed.slice(-keepRecent);
        this.recentArtists = this.recentArtists.slice(-2); // Keep only last 2 artists

        console.log(`Trimmed history to ${this.recentlyPlayed.length} songs, ${this.recentArtists.length} artists`);

        // Re-filter with trimmed history
        const recentUrlsAfterTrim = new Set(this.recentlyPlayed);
        availableSongs = songs.filter(song => !recentUrlsAfterTrim.has(song.song_url));

        // Skip artist filtering after reset for more variety
        diverseSongs = availableSongs;

        console.log(`After trimming: ${diverseSongs.length} songs available`);

        // If still nothing (shouldn't happen), clear completely
        if (diverseSongs.length === 0) {
          console.log('Still no options, clearing all history');
          this.recentlyPlayed = [];
          this.recentArtists = [];
          diverseSongs = songs;
        }
      }

      let randomSong;

      // More aggressive variety boost after clearing or when pool is small
      const useUniformRandom = justCleared || (diverseSongs.length < songs.length * 0.5);

      if (useUniformRandom && Math.random() < 0.5) {
        // 50% chance: completely uniform random selection
        randomSong = diverseSongs[Math.floor(Math.random() * diverseSongs.length)];
        console.log('Selection method: Uniform random (for variety)');
      } else {
        // Use weighted selection with strongly diminished returns
        const weightedSongs = diverseSongs.flatMap(song => {
          // Much more aggressive logarithmic scaling to reduce repeat bias
          const userWeight = Math.ceil(Math.log2(song.user_count + 1));
          const requestWeight = Math.ceil(Math.log2(song.total_requests + 1));
          const totalWeight = Math.max(1, Math.min(userWeight + requestWeight, 5)); // Cap at 5
          return Array(totalWeight).fill(song);
        });
        randomSong = weightedSongs[Math.floor(Math.random() * weightedSongs.length)];
        console.log('Selection method: Weighted random (capped)');
      }

      const radioSong = {
        url: randomSong.song_url,
        title: randomSong.song_title,
        artist: randomSong.song_artist || 'Unknown',
        requestedBy: { id: 'radio', name: 'Radio Station' }
      };

      // Add to recently played history with adaptive size
      this.recentlyPlayed.push(randomSong.song_url);
      while (this.recentlyPlayed.length > maxHistorySize) {
        this.recentlyPlayed.shift();
      }

      // Track recent artists with adaptive size
      if (randomSong.song_artist && randomSong.song_artist !== 'Unknown') {
        this.recentArtists.push(randomSong.song_artist);
        while (this.recentArtists.length > maxArtistHistory) {
          this.recentArtists.shift();
        }
      }

      console.log(`Selected: "${radioSong.title}" by ${radioSong.artist}`);
      console.log(`Updated history: ${this.recentlyPlayed.length}/${maxHistorySize} songs, ${this.recentArtists.length}/${maxArtistHistory} artists`);
      console.log(`=== End Debug ===\n`);

      await this.playSong(radioSong);
    } catch (error) {
      console.error('Error playing radio song:', error);
      if (this.textChannel) {
        this.textChannel.send('Error playing radio song. Trying next...').catch(console.error);
      }
      setTimeout(() => this.playRadioSong(), 2000);
    }
  }

  async playDiscoverySong() {
    try {
      this.updateActiveUsers();
      const userIds = Array.from(this.activeUsers);

      if (userIds.length === 0) {
        console.log('No users for discovery mode');
        return this.playRadioSong();
      }

      // Get user's existing songs to find similar content
      const songs = getMultipleUsersSongs(userIds, 50);

      if (songs.length === 0) {
        console.log('No songs to base discovery on, falling back to radio');
        return this.playRadioSong();
      }

      // Pick a random song from their library as a seed
      const seedSong = songs[Math.floor(Math.random() * songs.length)];
      console.log(`🔍 Discovery mode: Using "${seedSong.song_title}" as seed`);

      // Build a search query based on the seed song
      // Extract artist name or use title keywords
      let searchQuery;
      if (seedSong.song_artist && seedSong.song_artist !== 'Unknown') {
        // Search for similar songs by the same artist or genre
        const randomStrategy = Math.random();
        if (randomStrategy < 0.4) {
          searchQuery = `${seedSong.song_artist} similar songs`;
        } else if (randomStrategy < 0.7) {
          searchQuery = `${seedSong.song_artist} best songs`;
        } else {
          searchQuery = `songs like ${seedSong.song_title}`;
        }
      } else {
        // Use title-based search
        searchQuery = `songs like ${seedSong.song_title}`;
      }

      console.log(`🔍 Discovery search query: "${searchQuery}"`);

      // Search YouTube for related content
      const searchResults = await play.search(searchQuery, { limit: 10 });

      if (searchResults.length === 0) {
        console.log('No discovery results, falling back to radio');
        return this.playRadioSong();
      }

      // Filter out songs already in the user's library
      const knownUrls = new Set(songs.map(s => s.song_url));
      const newSongs = searchResults.filter(result => !knownUrls.has(result.url));

      if (newSongs.length === 0) {
        console.log('All results already known, falling back to radio');
        return this.playRadioSong();
      }

      // Pick a random new song from the results
      const discoveredVideo = newSongs[Math.floor(Math.random() * newSongs.length)];

      const discoverySong = {
        url: discoveredVideo.url,
        title: discoveredVideo.title,
        artist: discoveredVideo.channel?.name || 'Unknown',
        requestedBy: { id: 'discovery', name: '🔍 Discovery Mode' }
      };

      console.log(`🔍 Playing discovery: ${discoverySong.title}`);

      if (this.textChannel) {
        const embed = createInfoEmbed(
          '🔍 Discovery Mode',
          `Found something new based on **${seedSong.song_title}**!\n\n**${discoverySong.title}**\n\n👍 React to add it to your library!`
        );
        this.textChannel.send({ embeds: [embed] }).catch(console.error);
      }

      await this.playSong(discoverySong);
    } catch (error) {
      console.error('Error in discovery mode:', error);
      if (this.textChannel) {
        this.textChannel.send('Discovery mode failed, playing regular radio...').catch(console.error);
      }
      // Fall back to regular radio
      setTimeout(() => this.playRadioSong(), 2000);
    }
  }

  skip() {
    this.player.stop();
  }

  pause() {
    return this.player.pause();
  }

  resume() {
    return this.player.unpause();
  }

  clear() {
    this.queue = [];
  }

  getQueue() {
    return this.queue;
  }

  getCurrentSong() {
    return this.currentSong;
  }

  setRadioMode(enabled) {
    this.radioMode = enabled;
    if (enabled && !this.isPlaying) {
      this.playRadioSong();
    }
  }

  setDiscoveryMode(enabled) {
    this.discoveryMode = enabled;
    console.log(`Discovery mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  async cleanupMessages() {
    console.log(`Cleaning up ${this.botMessages.length} bot messages...`);

    // Send a farewell message before cleaning up
    if (this.textChannel && this.botMessages.length > 0) {
      try {
        const embed = createInfoEmbed(
          '📻 Station Sign-Off',
          'Thanks for listening! Clearing the airwaves...'
        );
        await this.textChannel.send({ embeds: [embed] });
      } catch (error) {
        console.error('Error sending farewell message:', error);
      }
    }

    // Delete all tracked messages
    for (const message of this.botMessages) {
      try {
        await message.delete();
      } catch (error) {
        // Message might already be deleted or bot lacks permissions
        console.log('Could not delete message:', error.message);
      }
    }

    this.botMessages = [];
    console.log('✓ Message cleanup complete');
  }

  async disconnect() {
    // Clean up messages before disconnecting
    await this.cleanupMessages();

    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    if (this.connection) {
      this.connection.destroy();
    }
    this.cleanup();
  }

  cleanup() {
    this.queue = [];
    this.currentSong = null;
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.connection = null;
    this.isPlaying = false;
    this.textChannel = null;
    this.voiceChannel = null;
    this.radioMode = false;
    this.discoveryMode = false;
    this.activeUsers.clear();
    this.recentlyPlayed = [];
    this.recentArtists = [];
    this.botMessages = [];
    this.player.stop();
  }
}

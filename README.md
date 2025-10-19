# EchoAnvil Radio Bot

A Discord music bot that learns user preferences and creates personalized radio stations based on who's in the voice channel.

## Features

- **Song Request Tracking**: Tracks every song requested by users
- **Personalized Radio Mode**: Automatically plays songs based on the preferences of users currently in the voice channel
- **Playlist Support**: Add entire YouTube playlists to quickly populate the radio station
- **Priority Queue**: Add songs to the front of the queue with priority flag
- **User History**: View your personal song request history
- **Smart Weighting**: Radio mode weights songs by user count and request frequency
- **Auto-Disconnect**: Bot leaves when everyone exits the voice channel
- **Database Persistence**: All listening data saved in SQLite database

## Commands

- `/play <url> [priority]` - Play a YouTube song or add to queue (set priority to true to add to front)
- `/playlist <url>` - Add an entire YouTube playlist to the queue and track all songs for radio mode
- `/skip` - Skip the current song
- `/queue` - View the current queue
- `/nowplaying` - Show currently playing song
- `/pause` - Pause playback
- `/resume` - Resume playback
- `/clear` - Clear the entire queue
- `/leave` - Disconnect bot from voice channel
- `/radio <on|off>` - Toggle radio mode (personalized station based on users in call)
- `/mysongs [limit]` - View your song request history
- `/stats` - Show bot statistics

## Setup

### Prerequisites

- Node.js 18+ installed
- Discord Bot Token and Client ID
- FFmpeg installed on your system

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and add your credentials:
```bash
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here # optional: enables instant guild command sync
```

3. Create a Discord bot at https://discord.com/developers/applications
   - Enable these Privileged Gateway Intents:
     - Server Members Intent
     - Message Content Intent
   - Generate OAuth2 URL with these scopes: `bot`, `applications.commands`
   - Bot permissions needed: `Connect`, `Speak`, `Use Voice Activity`

4. (Optional but recommended) Set up YouTube authentication to avoid rate limits:
```bash
npm run setup-youtube
```
Follow the prompts to authenticate. This helps prevent YouTube blocks.

 Alternatively, create a `youtube-cookies.txt` file in the project root with your YouTube cookie string (see docs/youtube-cookies-setup.md). The bot will load it automatically on startup.

5. Start the bot:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Docker Deployment

For production deployments, Docker is recommended for easier management and auto-updates.

#### Prerequisites
- Docker and Docker Compose installed
- Discord Bot Token and Client ID

#### Quick Start

1. Create a `.env` file in the project root:
```bash
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
```

2. Create data directory for database persistence:
```bash
mkdir data
```

3. Build and start the container:
```bash
docker-compose up -d
```

4. View logs:
```bash
docker-compose logs -f
```

5. Stop the bot:
```bash
docker-compose down
```

#### Auto-Updates with Watchtower

To enable automatic updates when you push new versions:

1. Create a `docker-compose.override.yml`:
```yaml
version: '3.8'

services:
  echosanvil-bot:
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 300 --cleanup --label-enable
```

2. Start both services:
```bash
docker-compose up -d
```

Watchtower will check for updates every 5 minutes and automatically update your bot when new versions are available.

#### Docker Commands

- **Rebuild after code changes**: `docker-compose up -d --build`
- **View container status**: `docker-compose ps`
- **Restart bot**: `docker-compose restart`
- **Remove all data**: `docker-compose down -v` (Warning: deletes database)

## How Radio Mode Works

When radio mode is enabled, the bot:
1. Tracks which users are currently in the voice channel
2. Queries the database for songs that those users have requested
3. Weights songs based on:
   - How many of the current users have requested it
   - Total number of times it's been requested
   - Recency of requests
4. Randomly selects from the weighted pool
5. Updates as users join/leave the channel

The more users in the channel who like a song, the more likely it is to play!

## Future Enhancements

- **Radio Talks**: Add audio clips that play between songs (database schema already included)
- **Spotify Integration**: Support Spotify URLs
- **Volume Control**: Adjust playback volume
- **Song Voting**: Skip songs by voting
- **Time-based Stats**: Track listening patterns over time
- **Favorite Songs**: Mark favorites and weight them higher in radio mode
- **Playlist Management**: Shuffle, reverse, or remove specific songs from queue

## Database Schema

The bot uses SQLite with three main tables:
- `user_songs` - Tracks all song requests per user
- `listening_history` - Records every song played to each user
- `radio_talks` - Stores radio talk audio clips (future feature)

## Troubleshooting

**Bot doesn't play audio:**
- Ensure FFmpeg is installed and in your PATH
- Check that the bot has proper voice permissions in Discord

**Commands don't appear:**
- Wait a few minutes for Discord to sync commands
- Check CLIENT_ID is correct in .env

**Database issues:**
- Delete `radio.db` to reset (will lose all data)

## Tech Stack

- discord.js v14
- @discordjs/voice
- play-dl (YouTube streaming)
- better-sqlite3
- Node.js ESM modules

## License

ISC

# Docker & Portainer Deployment Guide

This bot is fully compatible with Docker and Portainer. The database will persist across container restarts.

## Quick Start with Portainer

### 1. Create a Stack in Portainer

1. Go to **Stacks** → **Add Stack**
2. Name it: `echosanvil-bot`
3. Paste the contents of `docker-compose.yml`

### 2. Configure Environment Variables

In the Portainer stack editor, add these environment variables:

```yaml
environment:
  - DISCORD_TOKEN=your_discord_bot_token_here
  - CLIENT_ID=your_client_id_here
  - GUILD_ID=your_guild_id_here  # Optional
```

### 3. Deploy the Stack

Click **Deploy the stack** and the bot will start automatically.

## Database Persistence

The database is automatically saved to `/app/data/radio.db` inside the container, which is mapped to `./data/radio.db` on your host machine.

**Important:** Make sure the `./data` directory has proper permissions:
```bash
mkdir -p ./data
chmod 755 ./data
```

## Manual Docker Commands

### Build the Image
```bash
docker build -t echosanvil-bot .
```

### Run with Docker Compose
```bash
docker-compose up -d
```

### Run Manually
```bash
docker run -d \
  --name echosanvil-bot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your_token \
  -e CLIENT_ID=your_client_id \
  -v ./data:/app/data \
  echosanvil-bot
```

## Viewing Logs

In Portainer:
1. Go to **Containers**
2. Click on `echosanvil-bot`
3. Click **Logs**

Or via command line:
```bash
docker logs -f echosanvil-bot
```

## Updating the Bot

### Via Portainer:
1. Pull latest code from GitHub
2. Go to your stack
3. Click **Update the stack**
4. Enable **Re-pull image**
5. Click **Update**

### Via Command Line:
```bash
git pull
docker-compose down
docker-compose up -d --build
```

## Troubleshooting

### Database Not Persisting
- Check that the volume mount exists: `ls -la ./data/`
- Verify database path in logs: Look for `📊 Initializing database at:`
- Should show: `/app/data/radio.db`

### Voice Connection Issues
- Ensure `network_mode: bridge` is set in docker-compose.yml
- Discord voice requires stable UDP connectivity

### Resource Issues
Adjust memory limits in docker-compose.yml if needed:
```yaml
deploy:
  resources:
    limits:
      memory: 1G  # Increase from 512M if needed
```

## File Structure in Container

```
/app/
├── src/              # Application code
├── docs/             # Documentation
├── data/             # Persistent volume
│   └── radio.db      # Database file (persisted)
└── node_modules/     # Dependencies
```

## Health Check

The container includes a health check that runs every 30 seconds. If the bot crashes, Docker will automatically restart it.

## Security Notes

- The bot runs as a non-root user (`nodejs`) for security
- Never commit your `.env` file or tokens to Git
- Use Portainer secrets or environment variables for sensitive data
- Database files are excluded from the Docker image (see `.dockerignore`)

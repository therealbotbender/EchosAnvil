# Portainer Deployment Guide

This guide will help you deploy EchosAnvil Radio Bot using Portainer's web interface.

## Prerequisites

- Portainer installed and running
- Access to Portainer web UI
- Discord Bot Token and Client ID
- GitHub Container Registry access (or Docker Hub if you prefer)

## Method 1: Deploy from GitHub Container Registry (Recommended)

### Step 1: Set up GitHub Container Registry

First, we need to build and push the image to GitHub Container Registry:

```bash
# Build the image
docker build -t ghcr.io/therealbotbender/echosanvil:latest .

# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u therealbotbender --password-stdin

# Push the image
docker push ghcr.io/therealbotbender/echosanvil:latest
```

To create a GitHub token:
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token"
3. Select scopes: `write:packages`, `read:packages`, `delete:packages`
4. Copy the token and use it as `GITHUB_TOKEN` above

### Step 2: Deploy Stack in Portainer

1. **Login to Portainer**
   - Open your Portainer instance (usually `http://your-server:9000`)

2. **Create New Stack**
   - Go to **Stacks** → **Add stack**
   - Name: `echosanvil-bot`

3. **Configure Stack**
   - **Build method**: Choose "Web editor"
   - Copy the contents of `portainer-stack.yml` into the editor

4. **Set Environment Variables**
   - Scroll down to "Environment variables"
   - Click "Add an environment variable" for each:
     - `DISCORD_TOKEN` = `your_bot_token_here`
     - `CLIENT_ID` = `your_client_id_here`
     - `GUILD_ID` = `your_guild_id_here` (optional)

5. **Deploy**
   - Click "Deploy the stack"
   - Wait for containers to start

6. **Verify Deployment**
   - Go to **Containers**
   - Check that both `echosanvil-bot` and `echosanvil-watchtower` are running
   - Click on `echosanvil-bot` → **Logs** to verify it started correctly

## Method 2: Build Locally and Deploy

If you prefer to build the image locally:

### Step 1: Build Image

```bash
# In your project directory
docker build -t echosanvil-bot:latest .
```

### Step 2: Modify Stack File

Edit `portainer-stack.yml` and change:
```yaml
image: ghcr.io/therealbotbender/echosanvil:latest
```
to:
```yaml
image: echosanvil-bot:latest
```

### Step 3: Deploy in Portainer

Follow the same steps as Method 1, but use the modified stack file.

## Managing the Stack

### View Logs
1. Go to **Containers**
2. Click on `echosanvil-bot`
3. Click **Logs** tab
4. Enable "Auto-refresh" to see real-time logs

### Restart the Bot
1. Go to **Stacks** → `echosanvil-bot`
2. Click **Stop** then **Start**

Or from the Containers page:
1. Select `echosanvil-bot` container
2. Click **Restart**

### Update the Bot

With Watchtower enabled, updates happen automatically every 5 minutes when you push a new image.

**Manual update:**
1. Push new code to GitHub
2. Rebuild and push image:
   ```bash
   docker build -t ghcr.io/therealbotbender/echosanvil:latest .
   docker push ghcr.io/therealbotbender/echosanvil:latest
   ```
3. Watchtower will detect and update automatically
4. Or manually: **Stacks** → `echosanvil-bot` → **Pull and redeploy**

### View Resource Usage
1. Go to **Containers** → `echosanvil-bot`
2. Click **Stats** tab to see:
   - CPU usage
   - Memory usage
   - Network I/O
   - Storage I/O

### Access Database
The database is stored in the `echosanvil-data` volume.

To backup:
```bash
docker run --rm -v echosanvil-data:/data -v $(pwd):/backup alpine tar czf /backup/echosanvil-backup.tar.gz -C /data .
```

To restore:
```bash
docker run --rm -v echosanvil-data:/data -v $(pwd):/backup alpine tar xzf /backup/echosanvil-backup.tar.gz -C /data
```

## Troubleshooting

### Container Won't Start
1. Check logs: **Containers** → `echosanvil-bot` → **Logs**
2. Verify environment variables are set correctly
3. Check that Discord token is valid

### Bot Not Responding in Discord
1. Verify bot is online in Discord
2. Check logs for errors
3. Ensure bot has proper permissions in Discord server
4. Verify `CLIENT_ID` and `GUILD_ID` are correct

### Watchtower Not Updating
1. Check Watchtower logs: **Containers** → `echosanvil-watchtower` → **Logs**
2. Verify image was pushed to registry
3. Check that label `com.centurylinklabs.watchtower.enable=true` is set

### Database Lost After Restart
1. Verify volume is created: **Volumes** → `echosanvil-data`
2. Check volume mount in container: **Containers** → `echosanvil-bot` → **Volumes** tab
3. Restore from backup if needed

## Advanced Configuration

### Custom Update Interval

To change Watchtower check interval (default is 300 seconds = 5 minutes):

Edit the stack and change:
```yaml
- WATCHTOWER_POLL_INTERVAL=300
```

For example, 30 minutes:
```yaml
- WATCHTOWER_POLL_INTERVAL=1800
```

### Resource Limits

Adjust CPU and memory limits in the stack file:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'        # Increase to 2 CPUs
      memory: 1024M    # Increase to 1GB
```

Then redeploy the stack.

### Add YouTube Cookies

1. Upload `youtube-cookies.txt` to your server
2. Edit the stack and uncomment:
   ```yaml
   volumes:
     - /path/to/youtube-cookies.txt:/app/youtube-cookies.txt:ro
   ```
3. Update the path to your file location
4. Redeploy the stack

## Security Best Practices

1. **Use Secrets** (Portainer Business Edition):
   - Store tokens as secrets instead of environment variables
   - Reference in stack: `${PORTAINER_SECRET_discord_token}`

2. **Restrict Container Capabilities**:
   - The container already runs as non-root user
   - No privileged mode required

3. **Network Isolation**:
   - Stack uses dedicated network `echosanvil-network`
   - Only exposes what's necessary

4. **Regular Backups**:
   - Schedule automatic volume backups
   - Store backups off-server

5. **Monitor Logs**:
   - Regularly check logs for errors or suspicious activity
   - Set up log rotation (already configured)

## Portainer Webhook (Optional)

Set up a webhook for manual updates via API:

1. Go to **Stacks** → `echosanvil-bot`
2. Scroll to "Webhooks"
3. Click "Add webhook"
4. Copy the webhook URL

Trigger update:
```bash
curl -X POST https://your-portainer/api/webhooks/YOUR-WEBHOOK-ID
```

You can use this in CI/CD pipelines to auto-deploy when pushing to GitHub.

# Quick Build and Deploy Guide

## First Time Setup

Before deploying to Portainer, you need to build the Docker image on your server.

### Option 1: Build on the Server (Recommended)

1. **SSH into your server** or access the terminal

2. **Clone the repository:**
   ```bash
   git clone https://github.com/therealbotbender/EchosAnvil.git
   cd EchosAnvil
   ```

3. **Build the Docker image:**
   ```bash
   docker build -t echosanvil-bot:latest .
   ```

4. **Verify the image was created:**
   ```bash
   docker images | grep echosanvil
   ```
   You should see: `echosanvil-bot   latest   ...`

5. **Now deploy in Portainer:**
   - Go to Portainer UI
   - Stacks → Add stack → Name: `echosanvil-bot`
   - Web editor: Copy contents of `portainer-stack.yml`
   - Environment variables:
     - `DISCORD_TOKEN` = your token
     - `CLIENT_ID` = your client ID
     - `GUILD_ID` = your guild ID (optional)
   - Click "Deploy the stack"

### Option 2: Build Locally and Transfer

If you can't build on the server (low resources, etc.):

1. **Build locally on your PC:**
   ```bash
   cd "C:\Users\dan\Desktop\Coding Projects\Discord bot -Bot EchosAnvil"
   docker build -t echosanvil-bot:latest .
   ```

2. **Save the image to a file:**
   ```bash
   docker save echosanvil-bot:latest -o echosanvil-bot.tar
   ```

3. **Transfer to server** (via SCP, FTP, or USB):
   ```bash
   scp echosanvil-bot.tar user@server:/tmp/
   ```

4. **Load on server:**
   ```bash
   ssh user@server
   docker load -i /tmp/echosanvil-bot.tar
   ```

5. **Deploy in Portainer** (same as Option 1 step 5)

## Updating the Bot

When you make code changes and want to update:

### On Server:

```bash
cd EchosAnvil
git pull
docker build -t echosanvil-bot:latest .
```

Then in Portainer:
- Stacks → echosanvil-bot → "Pull and redeploy"
- Or: "Stop" then "Start" the stack

Watchtower will NOT auto-update local images. For auto-updates, you need to use a registry (GitHub Container Registry or Docker Hub).

## Using Auto-Updates with Registry

If you want Watchtower to automatically update your bot:

### Setup GitHub Container Registry:

1. **Create GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Generate new token (classic)
   - Scopes: `write:packages`, `read:packages`
   - Copy the token

2. **Build and push from your PC:**
   ```bash
   # Login (one time)
   echo YOUR_TOKEN | docker login ghcr.io -u therealbotbender --password-stdin

   # Build
   docker build -t ghcr.io/therealbotbender/echosanvil:latest .

   # Push
   docker push ghcr.io/therealbotbender/echosanvil:latest
   ```

3. **Make image public** (or add registry credentials to Portainer):
   - Go to: https://github.com/users/therealbotbender/packages/container/echosanvil
   - Package settings → Change visibility → Public

4. **Update portainer-stack.yml:**
   ```yaml
   image: ghcr.io/therealbotbender/echosanvil:latest
   ```

5. **Redeploy in Portainer**

Now when you push code changes:
```bash
git add .
git commit -m "Your changes"
git push
docker build -t ghcr.io/therealbotbender/echosanvil:latest .
docker push ghcr.io/therealbotbender/echosanvil:latest
```

Watchtower will detect and auto-update within 5 minutes!

## Quick Reference

**View logs:**
```bash
docker logs -f echosanvil-bot
```

**Restart bot:**
```bash
docker restart echosanvil-bot
```

**Stop and remove:**
```bash
docker stop echosanvil-bot
docker rm echosanvil-bot
```

**Database backup:**
```bash
docker run --rm -v echosanvil-data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz -C /data .
```

**Database restore:**
```bash
docker run --rm -v echosanvil-data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /data
```

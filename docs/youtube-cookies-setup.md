# YouTube Cookies Setup

**Required for age-restricted content!** Some YouTube videos require authentication to play. The bot uses cookies to bypass age verification.

## Quick Setup (Recommended)

### Method 1: Export cookies from browser

1. **Install browser extension:**
   - Chrome/Edge: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. **Export cookies:**
   - Go to https://www.youtube.com while logged in
   - Click the extension icon
   - Click "Export" or "Download"
   - Save as `cookies.txt` in your project root

3. **Restart the bot** - cookies will be automatically detected

### Method 2: Use cookies from browser automatically

Set environment variable to extract cookies from your browser:

```bash
# In your .env file
YOUTUBE_COOKIES_BROWSER=chrome
```

Supported browsers: `chrome`, `firefox`, `edge`, `safari`, `opera`, `brave`

**Note:** This requires the browser to be installed on the same machine as the bot.

### Method 3: Custom cookies path

If you want to store cookies in a different location:

```bash
# In your .env file
YOUTUBE_COOKIES_FILE=/path/to/your/cookies.txt
```

## Docker Setup

If running in Docker, you need to provide a cookies file:

1. Export cookies to `cookies.txt` on your host machine (see Method 1 above)
2. Mount the file in your docker-compose.yml or Portainer stack:

```yaml
volumes:
  - ./cookies.txt:/app/cookies.txt:ro
```

Or use environment variable:

```yaml
environment:
  - YOUTUBE_COOKIES_FILE=/app/cookies.txt
```

## Verifying Setup

When the bot starts, you should see:
```
Using YouTube cookies from: /app/cookies.txt
```

If you see this message, cookies are being used and age-restricted videos will work.

## Troubleshooting

### Cookies not working?
- Make sure you're logged into YouTube when exporting
- Cookies expire - re-export them (usually valid for 6-12 months)
- Ensure the cookies.txt file is in Netscape format
- Check file permissions (bot needs read access)

### Still getting age verification errors?
- Your cookies may have expired - re-export them
- Make sure the cookies are from the same YouTube account
- Try logging into YouTube and watching an age-restricted video manually first

## Important Notes

- **Keep cookies private** - they're already in `.gitignore`
- **Don't share cookies** - they contain your authentication
- **Cookies expire** - refresh them every 6-12 months
- **One account** - use a dedicated YouTube account for the bot if concerned about security

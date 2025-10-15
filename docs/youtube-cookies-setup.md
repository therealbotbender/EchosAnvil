# YouTube Cookies Setup

To avoid rate limiting and blocks from YouTube, you can authenticate using cookies.

## Method 1: Using play-dl's built-in authorization

```javascript
import play from 'play-dl';

// One-time setup - run this once
await play.authorization();
```

This will prompt you to log in via OAuth and save credentials.

## Method 2: Export cookies from browser (Recommended)

1. Install a browser extension like "Get cookies.txt LOCALLY"
2. Go to youtube.com while logged in
3. Export cookies
4. Save as `youtube-cookies.txt` in project root

## Method 3: Manual cookie setup

```javascript
import play from 'play-dl';

// Add to src/index.js before bot starts
const cookies = {
  youtube: {
    cookie: 'YOUR_YOUTUBE_COOKIE_STRING'
  }
};

await play.setToken(cookies);
```

## Getting Cookie String

1. Go to youtube.com (logged in)
2. Open DevTools (F12)
3. Go to Application > Cookies > https://www.youtube.com
4. Copy the values of these cookies:
   - VISITOR_INFO1_LIVE
   - CONSENT
   - PREF

Format: `VISITOR_INFO1_LIVE=value; CONSENT=value; PREF=value`

## Important Notes

- Keep cookies private (add to .gitignore)
- Cookies expire - you'll need to refresh them periodically
- Don't share cookies publicly
- Using cookies makes you appear as a regular user to YouTube

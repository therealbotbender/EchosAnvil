import play from 'play-dl';

console.log('Setting up YouTube authentication...');
console.log('This will help prevent rate limiting and blocks from YouTube.\n');

try {
  await play.authorization();
  console.log('\n✅ Authentication successful!');
  console.log('Your bot should now have fewer issues with YouTube rate limits.');
} catch (error) {
  console.error('❌ Authentication failed:', error.message);
  console.log('\nAlternative: Export cookies from your browser');
  console.log('See docs/youtube-cookies-setup.md for instructions');
}

process.exit(0);

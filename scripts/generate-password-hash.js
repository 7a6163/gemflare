const crypto = require('crypto');

// Check if a password was provided as a command-line argument
if (process.argv.length < 3) {
  console.error('Usage: node generate-password-hash.js <password>');
  process.exit(1);
}

const password = process.argv[2];

// Generate SHA-256 hash
const hash = crypto.createHash('sha256').update(password).digest('hex');

console.log('Password Hash:', hash);
console.log('\nTo set this in your wrangler.toml:');
console.log('ADMIN_PASSWORD_HASH = "' + hash + '"');
console.log('\nOr use wrangler secret:');
console.log('npx wrangler secret put ADMIN_PASSWORD_HASH');
console.log('Then enter: ' + hash);

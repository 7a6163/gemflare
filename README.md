# GemFlare

A private RubyGems server that runs on Cloudflare Workers, storing gem metadata in KV and gem files in R2.

## Features

- 🔒 Private gem hosting with admin authentication
- 📦 Compatible with standard RubyGems and Bundler clients
- 📊 Web UI for browsing and managing gems
- 📤 Upload gems via web UI or command line
- 📈 Track gem download statistics
- ☁️ Serverless architecture on Cloudflare Workers

## Setup

### Prerequisites

- Cloudflare account with Workers and R2 enabled
- Node.js and npm installed

### Installation

1. Clone this repository:

```bash
git clone https://github.com/7a6163/gemflare.git
cd gemflare
```

2. Install dependencies:

```bash
npm install
```

3. Create KV namespace and R2 bucket in Cloudflare:

```bash
npx wrangler kv:namespace create GEMFLARE_KV
npx wrangler kv:namespace create GEMFLARE_KV --preview
npx wrangler r2 bucket create gemflare-gems
npx wrangler r2 bucket create gemflare-gems-dev
```

4. Update the `wrangler.toml` file with your KV namespace IDs and R2 bucket names.

5. Set admin password:

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
```

When prompted, enter the SHA-256 hash of your admin password. You can generate this with:

```bash
echo -n "your-password" | shasum -a 256 | cut -d ' ' -f 1
```

### Development

Run the development server:

```bash
npm run dev
```

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Usage

### Web Interface

Visit your Cloudflare Worker URL to access the web interface. Log in with the admin credentials.

### Using with Bundler

Add this to your Gemfile:

```ruby
source "https://your-gemflare-url.workers.dev"
```

### Using with RubyGems

Configure your gem sources:

```bash
gem sources --add https://your-gemflare-url.workers.dev
```

### Uploading Gems

Via command line:

```bash
gem push your-gem-0.1.0.gem --host https://your-gemflare-url.workers.dev
```

You'll be prompted for your admin username and password.

## Architecture

- **Cloudflare Workers**: Serverless execution environment
- **Cloudflare KV**: Stores gem metadata and user credentials
- **Cloudflare R2**: Stores the actual gem files
- **Hono**: Lightweight web framework for Cloudflare Workers

## Security Considerations

- Admin authentication is required for uploading gems
- All gem downloads are tracked
- Consider adding IP restrictions or additional authentication methods for production use

## License

MIT

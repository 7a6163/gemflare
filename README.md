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

4. Create a `.dev.vars` file based on the example:

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` with your actual values:
- Update `GEMFLARE_KV_ID` and `GEMFLARE_KV_PREVIEW_ID` with your KV namespace IDs
- Update `GEMFLARE_BUCKET_NAME` and `GEMFLARE_PREVIEW_BUCKET_NAME` with your R2 bucket names
- Set `ADMIN_PASSWORD_HASH` to the SHA-256 hash of your admin password

You can generate a password hash with:

```bash
echo -n "your-password" | shasum -a 256 | cut -d ' ' -f 1
```

5. For production deployment, set your secrets:

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
```

When prompted, enter the SHA-256 hash of your admin password.

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

GemFlare now supports the Compact Index protocol, which is the modern way for RubyGems and Bundler to interact with gem servers.

To use GemFlare with Bundler, add the following to your Gemfile:

```ruby
source "https://your-gemflare-url"
```

Or configure Bundler to use your GemFlare server:

```bash
bundle config set --global source https://your-gemflare-url
```

For older versions of RubyGems, you can still use the traditional specs.4.8.gz endpoints, but we recommend using the Compact Index for better performance and compatibility.

### Using with RubyGems

Configure your gem sources:

```bash
gem sources --add https://your-gemflare-url.workers.dev
```

### Uploading Gems

Via command line:

```bash
gem push your-gem-0.1.0.gem --host https://your-gemflare-instance.workers.dev
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

## Open Source Considerations

If you're planning to make this project open source, consider the following:

1. **Sensitive Information**: The `wrangler.jsonc` file contains your Cloudflare KV namespace IDs and R2 bucket names. Before pushing to a public repository, you might want to:
   - Create a `wrangler.example.jsonc` with placeholder values
   - Add your actual `wrangler.jsonc` to `.gitignore`
   - Document this in your README

2. **Environment Variables**: For sensitive information like passwords, use environment variables or Cloudflare secrets:
   ```bash
   npx wrangler secret put ADMIN_PASSWORD_HASH
   ```

3. **Documentation**: Make sure your README includes clear instructions for other developers to set up their own KV namespaces and R2 buckets.

## License

MIT

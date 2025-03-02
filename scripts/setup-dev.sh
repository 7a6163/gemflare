#!/bin/bash

# Exit on error
set -e

echo "Setting up GemFlare development environment..."

# Install dependencies
echo "Installing npm dependencies..."
npm install

# Create KV namespace for development
echo "Creating KV namespace for development..."
KV_OUTPUT=$(npx wrangler kv:namespace create GEMFLARE_KV --preview 2>&1)
PREVIEW_ID=$(echo "$KV_OUTPUT" | grep -o 'preview_id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$PREVIEW_ID" ]; then
    echo "Failed to create KV namespace or extract preview_id"
    exit 1
fi

# Create R2 bucket for development
echo "Creating R2 bucket for development..."
npx wrangler r2 bucket create gemflare-gems-dev

# Update wrangler.toml with the preview_id
echo "Updating wrangler.toml with KV namespace preview_id..."
sed -i '' "s/preview_id = \"your-preview-kv-namespace-id\"/preview_id = \"$PREVIEW_ID\"/" wrangler.toml

echo "Setup complete! You can now run 'npm run dev' to start the development server."
echo "Default admin credentials: username 'admin', password 'admin123'"

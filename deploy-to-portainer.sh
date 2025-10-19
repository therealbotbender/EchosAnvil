#!/bin/bash
# Deployment script for Portainer
# Run this on your server before deploying the stack in Portainer

set -e

echo "======================================"
echo "EchosAnvil Bot - Portainer Deployment"
echo "======================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed!"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "Dockerfile" ]; then
    echo "Error: Dockerfile not found. Are you in the right directory?"
    exit 1
fi

echo "Step 1: Pulling latest code from GitHub..."
git pull

echo ""
echo "Step 2: Building Docker image..."
docker build -t echosanvil-bot:latest .

echo ""
echo "Step 3: Verifying image was created..."
if docker images | grep -q echosanvil-bot; then
    echo "✓ Image built successfully: echosanvil-bot:latest"
else
    echo "✗ Image build failed!"
    exit 1
fi

echo ""
echo "======================================"
echo "Build complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Go to your Portainer UI"
echo "2. Stacks → Add stack"
echo "3. Name: echosanvil-bot"
echo "4. Paste contents of portainer-stack.yml"
echo "5. Add environment variables:"
echo "   - DISCORD_TOKEN"
echo "   - CLIENT_ID"
echo "   - GUILD_ID (optional)"
echo "6. Click 'Deploy the stack'"
echo ""
echo "The stack will use the image: echosanvil-bot:latest"
echo ""

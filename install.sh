#!/bin/bash
# 🍭 Sweech installation script

set -e

echo "🍭 Installing Sweech..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "   Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. You have version $(node -v)"
    exit 1
fi

# Check Claude Code CLI
if ! command -v claude &> /dev/null; then
    echo "⚠️  Claude Code CLI not found."
    echo "   Install it with: npm install -g @anthropic/claude-code"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🔨 Building..."
npm run build

# Link globally
echo "🔗 Linking globally..."
npm link

echo ""
echo "✅ Sweech installed successfully!"
echo ""
echo "🚀 Get started:"
echo "   sweech add       # Add a new provider"
echo "   sweech list      # List configured providers"
echo ""
echo "⚠️  Don't forget to add to your PATH:"
echo '   echo '\''export PATH="$HOME/.sweech/bin:$PATH"'\'' >> ~/.zshrc'
echo "   source ~/.zshrc"
echo ""

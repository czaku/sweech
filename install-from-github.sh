#!/bin/bash
# Sweech Installer - Install from GitHub
# Usage: curl -fsSL https://raw.githubusercontent.com/czaku/sweech/main/install-from-github.sh | bash

set -e

echo "🍭 Installing Sweech..."
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    echo "Please install Node.js 18+ from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18+ required (you have: $(node -v))"
    echo "Please upgrade from: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"
echo ""

# Install directory (under ~/.sweech for organization)
INSTALL_DIR="$HOME/.sweech/installation"

# Remove old installation if exists
if [ -d "$INSTALL_DIR" ]; then
    echo "📦 Removing previous installation..."
    rm -rf "$INSTALL_DIR"
fi

# Create install directory
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "📦 Downloading sweech from GitHub..."
git clone --depth 1 https://github.com/czaku/sweech.git .

echo "📦 Installing dependencies..."
npm install --omit=dev

echo "🔗 Linking globally..."
npm link

echo ""
echo "✓ Sweech installed successfully!"
echo ""

# Show version
SWEECH_VERSION=$(sweech --version 2>/dev/null || echo "0.1.0")
echo "📍 Version: $SWEECH_VERSION"
echo ""

echo "✅ Ready to use! Try these commands:"
echo ""
echo "   sweech init      # Interactive onboarding"
echo "   sweech add       # Add a provider"
echo "   sweech doctor    # Check installation"
echo ""
echo "🎉 Happy sweeching!"

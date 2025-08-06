#!/bin/bash

# Development setup script for discrete-obsidian plugin

set -e  # Exit on any error

PLUGIN_NAME="discrete"
DEV_VAULT_PLUGIN_DIR="/Users/henrik/Code/DevVault/.obsidian/plugins/$PLUGIN_NAME"
CURRENT_DIR=$(pwd)

echo "Setting up development environment for $PLUGIN_NAME plugin..."

# Create the plugin directory if it doesn't exist
if [ ! -d "$DEV_VAULT_PLUGIN_DIR" ]; then
    echo "Creating plugin directory: $DEV_VAULT_PLUGIN_DIR"
    mkdir -p "$DEV_VAULT_PLUGIN_DIR"
fi


# Check if main.js exists
if [ ! -f "$CURRENT_DIR/main.js" ]; then
    echo "Error: main.js not found in the current directory ($CURRENT_DIR)."
    echo "Please first run 'npm run dev' to build the plugin."
    exit 1
fi

echo "Build files detected! Creating symlinks..."

# Remove existing symlinks or files if they exist
if [ -L "$DEV_VAULT_PLUGIN_DIR/main.js" ] || [ -f "$DEV_VAULT_PLUGIN_DIR/main.js" ]; then
    echo "Removing existing main.js..."
    rm "$DEV_VAULT_PLUGIN_DIR/main.js"
fi

if [ -L "$DEV_VAULT_PLUGIN_DIR/manifest.json" ] || [ -f "$DEV_VAULT_PLUGIN_DIR/manifest.json" ]; then
    echo "Removing existing manifest.json..."
    rm "$DEV_VAULT_PLUGIN_DIR/manifest.json"
fi

if [ -L "$DEV_VAULT_PLUGIN_DIR/styles.css" ] || [ -f "$DEV_VAULT_PLUGIN_DIR/styles.css" ]; then
    echo "Removing existing styles.css..."
    rm "$DEV_VAULT_PLUGIN_DIR/styles.css"
fi

# Create symlinks to the built files
echo "Creating symlink for main.js (built file)..."
ln -sf "$CURRENT_DIR/main.js" "$DEV_VAULT_PLUGIN_DIR/main.js"

echo "Creating symlink for manifest.json..."
ln -sf "$CURRENT_DIR/manifest.json" "$DEV_VAULT_PLUGIN_DIR/manifest.json"

echo "Creating symlink for manifest.json..."
ln -sf "$CURRENT_DIR/styles.css" "$DEV_VAULT_PLUGIN_DIR/styles.css"


echo ""
echo "✅ Setup complete!"
echo "Built files symlinked from: $CURRENT_DIR"
echo "To plugin directory: $DEV_VAULT_PLUGIN_DIR"

echo ""
echo "Starting continuous development mode..."

npm run dev


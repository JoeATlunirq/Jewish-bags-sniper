#!/bin/bash
# Bags Sniper - Run Script

set -e

echo "🚀 Starting Bags Sniper..."

cd "$(dirname "$0")"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Build in release mode for production
echo "📦 Building..."
cargo build --release

# Run
echo "✅ Starting sniper..."
RUST_LOG=info ./target/release/bags-sniper-core

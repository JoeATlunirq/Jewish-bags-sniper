#!/bin/bash
echo "Starting Bags Sniper..."

# Check if .env exists in core
if [ ! -f bags-sniper-core/.env ]; then
    echo "Creating .env in bags-sniper-core..."
    # (Env creation logic was handled by agent, just a check)
fi

# Detect PROTOC to fix build issues with spaces in path
PROTOC=$(which protoc)
if [ -z "$PROTOC" ]; then
    if [ -f "/opt/homebrew/bin/protoc" ]; then
        PROTOC="/opt/homebrew/bin/protoc"
    elif [ -f "/usr/local/bin/protoc" ]; then
        PROTOC="/usr/local/bin/protoc"
    fi
fi

if [ -n "$PROTOC" ]; then
    echo "Using PROTOC at $PROTOC"
    export PROTOC=$PROTOC
else
    echo "Warning: protoc not found. Build may fail."
fi



# Workaround for spaces in path ("Code Projects") causing protobuf build failure
# Symlinks resolve to real path, so we MUST copy to a safe location
CURRENT_DIR=$(pwd)
BUILD_DIR="/tmp/bags-sniper-safe"
echo "Syncing project to $BUILD_DIR to avoid spaces in path..."
mkdir -p "$BUILD_DIR"
rsync -a --exclude 'target' --exclude 'node_modules' --exclude '.git' "$CURRENT_DIR/" "$BUILD_DIR/"

echo "Building Rust Core in safe path..."
cd "$BUILD_DIR/bags-sniper-core"
cargo build
if [ $? -ne 0 ]; then
    echo "Rust build failed."
    rm "$BUILD_DIR"
    exit 1
fi

# Start Rust Core
echo "Starting Rust Sniper Core..."
./target/debug/bags-sniper-core &
CORE_PID=$!
echo "Core PID: $CORE_PID"

# Start Frontend
cd ../bags-sniper-web
echo "Installing Frontend Dependencies..."
npm install
echo "Starting Frontend..."
npm run dev &
WEB_PID=$!
echo "Web PID: $WEB_PID"

echo "Bags Sniper is running!"
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:3001"
echo "Press Ctrl+C to stop both."

trap "kill $CORE_PID $WEB_PID; rm $BUILD_DIR; exit" SIGINT SIGTERM

wait

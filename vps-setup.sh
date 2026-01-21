#!/bin/bash

# VPS Setup Script for Bags Sniper
# This script sets up a fresh Ubuntu server with Rust, Node.js, and necessary build tools.

set -e  # Exit on error

echo "Starting VPS Setup..."

# 1. Update & Upgrade System
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 1.5 Configure Swap (Critical for 4GB RAM VPS)
# Next.js builds can consume lots of RAM. This prevents Out-Of-Memory crashes.
if [ ! -f /swapfile ]; then
    echo "Creating 4GB Swap file..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap enabled."
else
    echo "Swap already exists."
fi

# 2. Install Build Essentials & Dependencies
echo "Installing build dependencies..."
sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl git ufw nginx

# 3. Install Rust
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust is already installed."
fi

# 4. Install Node.js (via NVM)
echo "Installing NVM & Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20
nvm alias default 20

# 5. Install PM2
echo "Installing PM2..."
npm install -g pm2

# 6. Configure Firewall (UFW)
echo "Configuring Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
# sudo ufw enable  # Uncomment to auto-enable, but safer to do manually to avoid lockout

# 7. Final Checks
echo "---------------------------------------"
echo "Setup Complete!"
echo "Rust Version: $(rustc --version)"
echo "Node Version: $(node -v)"
echo "NPM Version: $(npm -v)"
echo "Swap Status:"
free -h
echo "---------------------------------------"
echo "Please re-login or run 'source ~/.bashrc' (and source cargo env) to update your current shell session."

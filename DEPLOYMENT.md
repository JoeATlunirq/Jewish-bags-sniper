# Deployment Guide for Bags Sniper

This guide details the steps to deploy the Bags Sniper application (Rust Core + Next.js Web) to a fresh Ubuntu VPS.

## Prerequisites

- **VPS**: Ubuntu 22.04 LTS or 24.04 LTS.
- **Hardware**: High frequency CPU recommended (e.g., Hetzner CCX line or Vultr High Frequency).
- **Domain** (Optional but recommended): For SSL/HTTPS on the web interface.
- **Solana RPC**: A high-performance HTTP and WebSocket RPC URL (e.g., Helius, Triton).

## 1. Initial Server Setup

Login to your VPS as root:
```bash
ssh root@<YOUR_VPS_IP>
```

Create a new user (don't run everything as root):
```bash
adduser sniper
usermod -aG sudo sniper
su - sniper
```

## 2. Automated Setup Script

We have provided a script `vps-setup.sh` to install all necessary dependencies (Rust, Node, Nginx, etc.).

1.  **Copy the script** to your VPS (or create it using `nano vps-setup.sh` and pasting the content).
2.  **Make it executable**:
    ```bash
    chmod +x vps-setup.sh
    ```
3.  **Run it**:
    ```bash
    ./vps-setup.sh
    ```

This will install:
- System updates
- Rust (`rustup`, `cargo`)
- Node.js (v20 LTS) & NVM
- Build tools & Libraries (`pkg-config`, `libssl-dev`, `libudev-dev`)
- PM2 (Process Manager for Node)
- Nginx (Web Server/Proxy)

## 3. Clone & Configure Application

Clone your repository to the VPS:
```bash
git clone https://github.com/JoeATlunirq/Jewish-bags-sniper.git app
cd app
```

### Configure Environment Variables
**Core**:
Copy the example env and edit it:
```bash
cp bags-sniper-core/.env.example bags-sniper-core/.env
nano bags-sniper-core/.env
```
*Fill in your PRIVATE_KEY, RPC_URL, etc.*

**Web**:
```bash
cp bags-sniper-web/.env.example bags-sniper-web/.env.local
nano bags-sniper-web/.env.local
```
*Configure any public env vars needed for the frontend.*

## 4. Build & Run

### A. Bags Sniper Core (Rust)

1.  **Build**:
    ```bash
    cd ~/app/bags-sniper-core
    cargo build --release
    ```
2.  **Setup Systemd Service** (to keep it running):
    Create a service file:
    ```bash
    sudo nano /etc/systemd/system/bags-sniper.service
    ```
    Paste the following (adjust paths if needed):
    ```ini
    [Unit]
    Description=Bags Sniper Core
    After=network.target

    [Service]
    User=sniper
    WorkingDirectory=/home/sniper/app/bags-sniper-core
    ExecStart=/home/sniper/app/bags-sniper-core/target/release/bags-sniper-core
    Restart=always
    RestartSec=3

    [Install]
    WantedBy=multi-user.target
    ```

3.  **Start the Service**:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable bags-sniper
    sudo systemctl start bags-sniper
    ```
4.  **View Logs**:
    ```bash
    sudo journalctl -u bags-sniper -f
    ```

### B. Bags Sniper Web (Next.js)

1.  **Install & Build**:
    ```bash
    cd ~/app/bags-sniper-web
    npm install
    npm run build
    ```
2.  **Start with PM2**:
    ```bash
    pm2 start npm --name "bags-web" -- start
    pm2 save
    pm2 startup
    ```
    *(Run the command PM2 outputs to freeze the process list on reboot)*

## 5. Nginx Configuration (Reverse Proxy)

Configure Nginx to expose the Next.js app on port 80/443.

1.  Edit default config:
    ```bash
    sudo nano /etc/nginx/sites-available/default
    ```
2.  Replace content with:
    ```nginx
    server {
        listen 80;
        server_name _;  # Or your domain name

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
3.  Restart Nginx:
    ```bash
    sudo systemctl restart nginx
    ```

## 6. Verification
- Visit `http://<YOUR_VPS_IP>` to see the web interface.
- Check backend logs (`sudo journalctl -u bags-sniper -f`) to ensure the sniper is connected and monitoring.

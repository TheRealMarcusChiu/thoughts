---
date: 2025-12-03T00:00:00-00:00
draft: false
title: "How to Setup a Bitcoin Pruned Node Over TOR on Ubuntu"
---

# Setup TOR

Install TOR via apt:

```
sudo apt update
sudo apt install tor
```

Enable and start TOR:

```
sudo systemctl enable tor
sudo systemctl start tor
sudo systemctl status tor
```

# Setup Pruned Node

Go to https://bitcoincore.org/en/download/ and copy link of latest version

```
wget https://bitcoincore.org/bin/bitcoin-core-29.2/bitcoin-29.2-x86_64-linux-gnu.tar.gz
tar -xvf bitcoin-29.2-x86_64-linux-gnu.tar.gz
sudo install -m 0755 -o root -g root -t /usr/local/bin bitcoin-29.2/bin/*
```

Create Bitcoin core config

```
mkdir -p ~/.bitcoin
vim ~/.bitcoin/bitcoin.conf
```

Add the following into the file

```ini
### PRUNED NODE ###
prune=550           # ~5.5 GB (minimum)
txindex=0
 
### RPC ###
server=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
 
### TOR-ONLY NETWORKING ###
proxy=127.0.0.1:9050
onlynet=onion
listen=1
dnsseed=0
 
### TOR CONTROL (optional but recommended) ###
torcontrol=127.0.0.1:9051
torpassword=your_tor_control_password
 
### PRIVACY ###
listenonion=1
discover=0
upnp=0
natpmp=0
 
### PERFORMANCE ###
dbcache=300
maxconnections=12
```

Start the node:

```
bitcoind -daemon
```

Check status:

```
bitcoin-cli getblockchaininfo
```

you should see:

```
"pruned": true
```

Check Tor usage:

```
bitcoin-cli getnetworkinfo
```

Look for:

```
"network": "onion"
```

# Run at Boot with Systemd

stop manually running bitcoind

```
bitcoin-cli stop
```

Create new systemd file:

```
sudo vim /etc/systemd/system/bitcoind.service
```

add the following

```ini
[Unit]
Description=Bitcoin Daemon
After=network.target
 
[Service]
ExecStart=/usr/local/bin/bitcoind -daemon -conf=/root/.bitcoin/bitcoin.conf
ExecStop=/usr/local/bin/bitcoin-cli stop
User=root
Type=forking
Restart=always
 
[Install]
WantedBy=multi-user.target
```

Reload

```
sudo systemctl daemon-reload
sudo systemctl enable bitcoind
sudo systemctl start bitcoind
```

Verify Everything is Working

```
bitcoin-cli getnetworkinfo
bitcoin-cli getpeerinfo
bitcoin-cli getmempoolinfo
```

# Create Wallet

Create Wallet

```
bitcoin-cli createwallet "marcus-chiu-wallet"
```

Check if wallet is loaded:

```
bitcoin-cli getwalletinfo
```

Backup Wallet

```
bitcoin-cli backupwallet ~/wallet-backup.dat
```

Load an Existing Wallet

```
bitcoin-cli loadwallet ~/wallet-backup.dat
```

List Wallets

```
bitcoin-cli listwallets
```
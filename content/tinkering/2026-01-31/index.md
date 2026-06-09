---
date: 2026-01-31T00:00:00-00:00
draft: false
title: "Disable SSH Password Login in Proxmox LXC Containers"
---

When running LXC containers on Proxmox, one of the simplest and most effective security improvements you can make is disabling SSH password authentication and enforcing SSH key–only access.

# Update Manually

Modify the SSH daemon configuration file inside the container:

```bash
vim /etc/ssh/sshd_config
```

Add the following lines below to the end of the file and save:

```bash
# Marcus Chiu Changes - START
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
# Marcus Chiu Changes - END
```

Reload and restart the SSH daemon to apply changes:

```bash
sudo systemctl reload sshd
sudo systemctl restart sshd
```

Verify password login is denied:

```bash
ssh root@192.168.0.111
```

# Update Automatically via Script

If you have multiple LXC containers like me, manually updating them is grunt work. Let a script handle this work.

In the proxmox host create a script `update_ssh_config.sh`:

```bash
#!/bin/bash

# Script to update SSH configuration in a specific Proxmox LXC container
# Usage: ./update_ssh_config.sh <container_id>
# Run this on your Proxmox host

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if container ID is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Container ID is required${NC}"
    echo "Usage: $0 <container_id>"
    echo ""
    echo "Available containers:"
    pct list
    exit 1
fi

CTID=$1

echo -e "${GREEN}=== Proxmox LXC SSH Configuration Update ===${NC}"
echo ""

# Check if container exists
if ! pct status ${CTID} &>/dev/null; then
    echo -e "${RED}Error: Container ${CTID} does not exist${NC}"
    echo ""
    echo "Available containers:"
    pct list
    exit 1
fi

# Get container name
CT_NAME=$(pct list | grep "^${CTID}" | awk '{print $3}')

echo -e "${YELLOW}Processing Container ${CTID} (${CT_NAME})...${NC}"
echo ""

# Check if container is running
STATUS=$(pct status ${CTID} | awk '{print $2}')

if [ "$STATUS" != "running" ]; then
    echo -e "${RED}Error: Container ${CTID} is not running${NC}"
    echo "Please start the container first with: pct start ${CTID}"
    exit 1
fi

# Check if sshd_config exists
if ! pct exec ${CTID} -- test -f /etc/ssh/sshd_config; then
    echo -e "${RED}Error: SSH is not installed in container ${CTID}${NC}"
    echo "Please install SSH first: pct exec ${CTID} -- apt-get install openssh-server"
    exit 1
fi

echo -e "${GREEN}✓ Container is running and SSH is installed${NC}"
echo ""

# Backup original sshd_config
BACKUP_FILE="/etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)"
echo "Creating backup at ${BACKUP_FILE}..."
pct exec ${CTID} -- cp /etc/ssh/sshd_config ${BACKUP_FILE}
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

# Check if Marcus Chiu changes already exist
if pct exec ${CTID} -- grep -q "Marcus Chiu Changes" /etc/ssh/sshd_config; then
    echo -e "${YELLOW}Warning: Marcus Chiu changes already exist in configuration${NC}"
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Update SSH configuration
echo "Updating SSH configuration..."
pct exec ${CTID} -- bash -c "cat >> /etc/ssh/sshd_config" <<'EOF'

# Marcus Chiu Changes - START
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
# Marcus Chiu Changes - END
EOF

echo -e "${GREEN}✓ Configuration updated${NC}"
echo ""

# Test SSH configuration
echo "Testing SSH configuration..."
if pct exec ${CTID} -- sshd -t 2>&1; then
    echo -e "${GREEN}✓ SSH configuration is valid${NC}"
    echo ""
else
    echo -e "${RED}✗ SSH configuration test failed${NC}"
    echo "Restoring backup..."
    pct exec ${CTID} -- cp ${BACKUP_FILE} /etc/ssh/sshd_config
    echo -e "${YELLOW}Configuration restored from backup${NC}"
    exit 1
fi

# Reload/restart SSH service
echo "Reloading SSH service..."
if pct exec ${CTID} -- systemctl reload sshd 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service reloaded (sshd)${NC}"
elif pct exec ${CTID} -- systemctl reload ssh 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service reloaded (ssh)${NC}"
elif pct exec ${CTID} -- systemctl restart sshd 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service restarted (sshd)${NC}"
elif pct exec ${CTID} -- systemctl restart ssh 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service restarted (ssh)${NC}"
elif pct exec ${CTID} -- service ssh restart 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service restarted (service)${NC}"
else
    echo -e "${RED}✗ Failed to reload/restart SSH service${NC}"
    exit 1
fi

echo ""

# Check SSH service status
echo "Checking SSH service status..."
if pct exec ${CTID} -- systemctl is-active --quiet sshd 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service is running (sshd)${NC}"
elif pct exec ${CTID} -- systemctl is-active --quiet ssh 2>/dev/null; then
    echo -e "${GREEN}✓ SSH service is running (ssh)${NC}"
else
    echo -e "${RED}✗ SSH service status unclear${NC}"
    echo "Please check manually: pct exec ${CTID} -- systemctl status sshd"
fi

echo ""
echo -e "${GREEN}=== SUCCESS ===${NC}"
echo -e "Container ${CTID} (${CT_NAME}) has been updated successfully"
echo ""
echo -e "${YELLOW}IMPORTANT REMINDERS:${NC}"
echo "1. Backup saved at: ${BACKUP_FILE}"
echo "2. Password authentication is now DISABLED"
echo "3. Make sure you have SSH keys configured before logging out!"
echo "4. To restore backup if needed:"
echo "   pct exec ${CTID} -- cp ${BACKUP_FILE} /etc/ssh/sshd_config"
echo "   pct exec ${CTID} -- systemctl restart sshd"
```

Make it executable:

```bash
chmod +x update_ssh_config.sh
```

Run script:

```bash
./update_ssh_config.sh <container_id>
```

# Conclusion

By using this script, you ensure all your LXC containers enforce key-based SSH authentication, reducing the attack surface and improving overall server security.

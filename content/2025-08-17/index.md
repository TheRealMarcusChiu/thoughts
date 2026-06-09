---
date: 2025-08-17T00:00:00-05:00
draft: false
title: "Promox Gitea - Change HTTP Port to 80"
---

This-ah short one.

# Problem

The current [Proxmox Helper Script for gitea LXC](https://community-scripts.github.io/ProxmoxVE/scripts?id=gitea) 
runs on port 3000. Changing it to port 80 is not so simple... until now.

# Solution

First run Proxmox helper script for Gitea as usual:

```shell
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/gitea.sh)"
```

Once completed, access the shell of the newly created LXC container.

```shell
vim /etc/gitea/app.ini
```

Add the following contents to `/etc/gitea/app.ini`:

```ini
[server]
HTTP_PORT = 80
ROOT_URL = http://gitea.lan/
```

Next, execute the following command (which will allow `/usr/local/bin/gitea` to access port 80):

```shell
sudo setcap 'cap_net_bind_service=+ep' /usr/local/bin/gitea
```

Restart Gitea server:

```shell
systemctl restart gitea
```

Then delete the file `/etc/gitea/app.ini` as it will collide with the Gitea Console UI setup process.

```shell
rm /etc/gitea/app.ini
```

Go to the Gitea Console UI and proceed as normal.

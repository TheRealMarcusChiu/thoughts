---
date: 2025-07-16T00:00:00-05:00
draft: false
title: "Network File System (NFS)"
---

# Problem

I have a problem. I got two linux boxes and I need one of them to access and modify a directory of the other box.

# Solution

Network File Systems (NFS) 🙌

# Table of Contents

- **Setup NFS Server** - set this up on the box that contains the directory you want to share
- **Setup NFS Client**

# Setup NFS Server

On Debian or Ubuntu install NFS server via:

```shell
sudo apt-get update
sudo apt install nfs-kernel-server
```

Create directory you want to share

```shell
sudo mkdir /home/marcuschiu/directory-to-be-shared
```

Set permissions

```shell
sudo chown nobody:nogroup /home/marcuschiu/directory-to-be-shared #no-one is owner
sudo chmod 777 /home/marcuschiu/directory-to-be-shared #everyone can modify files
```

Define access for NFS clients in `/etc/exports` file.

Example file `/etc/exports`:

```shell
/home/marcuschiu/directory-to-be-shared 192.168.111.38/255.255.255.0(rw,sync,no_subtree_check)
```

Set changes and restart NFS server

```shell
sudo exportfs -a #making the file share available
sudo systemctl restart nfs-kernel-server #restarting the NFS kernel
```

# Setup NFS Client

On Debian or Ubuntu install the NFS client dependencies

```shell
sudo apt-get update
sudo apt install nfs-common
```

Mount the NFS directory temporarily

```shell
sudo mount -t nfs {IP of NFS server}:{folder path on server} /home/client
sudo mount -t nfs 192.168.111.10:/home/marcuschiu/directory-to-be-shared /home/client
```

Mount the NFS directory PERMANENTLY

In `/etc/fstab` file add the following line:

```shell
{IP of NFS server}:{folder path on server} /var/locally-mounted nfs defaults 0 0
 
# e.g.
 
192.168.111.10:/home/marcuschiu/directory-to-be-shared /home/client nfs defaults 0 0
```

# Verify

Verify writing in one box reflects it's changes in another box!

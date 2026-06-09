---
date: 2025-12-02T00:00:00-00:00
draft: false
title: "NFS Client on Proxmox LXC"
---

# Problem

I have an NFS share that needs to be mounted on a Proxmox LXC container.

I used the following command to mount:

```shell
sudo mount -t nfs 192.168.0.222:/mnt/hello /mnt/client -vvv
```

But I've been getting the following errors:

```shell
mount.nfs: timeout set for Mon Dec 29 16:10:50 2025
mount.nfs: trying text-based options 'vers=4.2,addr=192.168.0.222,clientaddr=192.168.0.199'
mount.nfs: mount(2): Operation not permitted
mount.nfs: trying text-based options 'addr=192.168.0.222'
mount.nfs: prog 100003, trying vers=3, prot=6
mount.nfs: trying 192.168.0.222 prog 100003 vers 3 prot TCP port 2049
mount.nfs: prog 100005, trying vers=3, prot=17
mount.nfs: trying 192.168.0.222 prog 100005 vers 3 prot UDP port 44006
mount.nfs: mount(2): Operation not permitted
mount.nfs: Operation not permitted for 192.168.0.222:/mnt/hello on /mnt/client
```

# Solution

I got it to work by creating the LXC container in privileged mode.

In Proxmox host, you'll need to modify the LXC's conf file `/etc/pve/lxc/LXC_ID_HERE.conf`.
Then add the following contents into the file:

```yaml
unprivileged: 0
lxc.apparmor.profile: unconfined
lxc.cap.drop:
```

Reboot LXC container.

Verify NFS share is up by executing within the LXC container:

```shell
showmount -e 192.168.0.222
```

# Temporary mount (goes away after LXC reboot)

```shell
sudo mount -t nfs 192.168.0.222:/mnt/hello /mnt/client -vvv
```

# Permanent mount (remounts after LXC reboot)

Modify `/etc/fstab` and add the following line:

```shell  
192.168.0.222:/mnt/hello /mnt/client nfs defaults 0 0
```

The structure is as follows:

```shell
{IP of NFS server}:{folder path on server} /var/locally-mounted nfs defaults 0 0
```

Then mount changes in `/etc/fstab`:

```shell
sudo mount -a
```

or 

```shell
systemctl daemon-reload
```
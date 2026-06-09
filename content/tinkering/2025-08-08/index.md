---
date: 2025-08-08T00:00:00-05:00
draft: false
title: "Locked out of my Router (OPNsense)"
---

# Problem

I've set up remote access to configure my OPNsense router, so that whenever I need to configure 
it I don't need to be there in person.
Unfortunately, I've accidentally messed up a config, and it locked me out of the router :(

# Solution

First, I connected an ethernet cable to the router in an attempt to access the Web console.

It didn't work.

So this means I have to configure this via terminal (which I've never done before).
But after a lot of googling and accidentally breaking some rivets in the process, I've
managed to fix it.

Below is how I've fixed it.

Connect USB console to laptop. Then execute the following to access serial console:

```shell
screen /dev/tty.usbmodemQ75087985611 115200
```

You may need to change `/dev/tty.usbmodemQ75087985611` to something else.

In macbook, I've listed all USB devices attached to it via:

```shell
ls /dev | grep usb
```

Once the serial console is open:
- click enter
- login

It should output something like this:

```shell
*** OPNsense.localdomain: OPNsense 24.10.2_8 (amd64) ***

LAN (igc0)      -> v4: 192.168.111.1/24
MyOpenVPNInstance (ovpns2) -> v4: 10.222.222.1/24
MyOpenVPNInstancelocal (ovpns1) -> v4: 10.111.111.1/24
WAN (igc2)      -> v4: 192.168.86.51/24

HTTPS: sha256 6F DB 5E 1A CA A2 B8 D9 17 78 D0 54 A7 05 BD D8
AA B4 0C 94 28 4D 7D D8 94 62 BE 41 BF AB 30 21

0) Logout                              7) Ping host
1) Assign interfaces                   8) Shell
2) Set interface IP address            9) pfTop
3) Reset the root password            10) Firewall log
4) Reset to factory defaults          11) Reload all services
5) Power off system                   12) Update from console
6) Reboot system                      13) Restore a backup

Enter an option: 8
```

Enter option `8`.

Make backup of the `config.xml`:

```shell
cp /conf/config.xml /conf/config.xml.bak
```

Let's edit the `config.xml`:

```shell
vi /conf/config.xml
```

Make your changes, here I've made changes to the WAN interface:

```xml
  <interfaces>
    <wan>
      <if>igc2</if>
      <descr/>
      <enable>1</enable>
      <lock>1</lock>
      <spoofmac/>
      <blockbogons>1</blockbogons>
      <ipaddr>192.168.0.1</ipaddr>
      <subnet>24</subnet>
      <ipaddrv6>dhcp6</ipaddrv6>
      <dhcp6-ia-pd-len>0</dhcp6-ia-pd-len>
      ...
```

Save changes by pressing `esc` then `:` followed by `wq` and `enter`.

Finally, reload the `config.xml` via:

```shell
/usr/local/etc/rc.reload_all
```

---
date: 2025-06-21T00:00:00-05:00
draft: false
title: "Homelab #8 - Wake on LAN (WoL) Proxmox"
---

It's been a couple of years since I've heard of Wake on LAN (WoL) and today I finally decided to set it up.

What is WoL? Well it allows you to power on a computer over the network, even when the computer is turned off.

# Table of Contents
- WoL Setup Proxmox Host Machine
- WoL Setup Proxmox Guest Machines
- Verify

# WoL Setup Proxmox Host Machine

First we got to enable it in 2 places
- in BIOS
- in OS

### In BIOS

Each computer's BIOS settings are different, so try to enable something like 'Wake on LAN (WoL)'.
Usually, it should be under the `Power Management Tab`.

### In OS

Install `ethtool`:

```shell
apt install ethtool -y
```

Show network interfaces

```shell
ip addr
```

Find something that looks like `enp114s0` and make note of it. In my case it looks like:

```shell {hl_lines=[8]}
root@pve2:~# ip addr
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host noprefixroute
       valid_lft forever preferred_lft forever
2: enp114s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq master vmbr0 state UP group default qlen 1000
    link/ether 48:21:0b:5f:e9:05 brd ff:ff:ff:ff:ff:ff
3: wlo1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
    link/ether e4:0d:36:09:a1:cd brd ff:ff:ff:ff:ff:ff
    altname wlp0s20f3
```

Check if WoL is enabled

```shell
ethtool enp114s0
```

Ensure output contains `Wake-on: g`, something like:

```shell {hl_lines=[2, 3]}
...
    MDI-X: off (auto)
    Supports Wake-on: pumbg
    Wake-on: g
        Current message level: 0x00000007 (7)
                               drv probe link
    Link detected: yes
```

If it doesn't contain `g` then check if it supports it by verifying `Supports Wake-on: pumbg`

If supported then enable it:

**Temporary Enable**

The following command only lasts one computer restart :/

```shell
ethtool -s enp114s0 wol g
```

**Permanent Enable**

Create a service file /etc/systemd/system/wol.service with the following

```ini
[Unit]
Description=Enable Wake On Lan
# Run after everything else
After=multi-user.target network-online.target default.target
Wants=network-online.target
 
[Service]
Type=oneshot
ExecStart = /usr/sbin/ethtool --change enp12s0 wol g
 
[Install]
WantedBy=default.target
```

Execute the following

```shell
sudo systemctl daemon-reload
sudo systemctl enable wol.service
systemctl status wol
```

Now WoL is configured on your Proxmox Host Machine! 

# WoL Setup Proxmox Guest Machines

Sometimes you want to WoL your guest machines within the Proxmox Host Machine!

Based on: https://github.com/djraw/pve-dosthol

Install dependencies

```shell
apt install gawk socat xxd
```

Add the following file into `/usr/local/bin/dosthold.sh`:

```shell
#!/bin/bash
 
# dosthol - Do something on LAN
#   Skript to do something with remote virtual machines
#   Written primarily for Proxmox VE >=v4.x
#
# Author: Oliver Jaksch <proxmox-forum@com-in.de>
#
# Daemon changelog:
#   v0.7 (2020-12-02) - Fixup dependency check, added Reboot command, changed from GPLv2 to GPLv3
#   v0.6 (2020-12-02) - Check for missing dependencies
#   v0.5 (2019-03-17) - Beautify shell execs, limit grep to find only one result (thanks cheffe)
#   v0.4 (2017-01-03) - Expanded Resume: Send a key before resume (Windows Standby)
#   v0.3 (2016-03-11) - Fixed typo in dosthol.service
#   v0.2 (2016-03-07) - Renamed dosthol to dosthold, created client dostholc, finished more commands, turned to socat
#   v0.1 (2016-03-06) - Initial work; starting virtual machines per wake-on-lan works
#
# Distributed under the terms of the GNU General Public License v3 (https://www.gnu.org/licenses/gpl)
 
 
 
function LOG {
    logger -i "dosthol: ${CMDONLAN} VM ${VMID} (${VMNAME}) (${WHICHVIRT})"
}
 
# check for missing dependencies
for packages in gawk socat xxd; do
    checkbin=$(which ${packages} &>/dev/null)
    [[ ${?} = 1 ]] && echo "Missing program ${packages}, can't continue without it. Exiting." && exit 1
done
 
while PID=$(pidof -x dosthold.sh); do
FNAM=$(mktemp)
 
# socat listens on udp/9, when packet arrives it exits
# gawk magic thanks to <https://stackoverflow.com/questions/31341924/sed-awk-insert-commas-every-nth-character>
socat -u udp-recv:9,readbytes=102 - | xxd -u -p -c 102 | gawk '{$1=$1}1' FPAT='.{2}' OFS=: > ${FNAM}
 
# get header (6*FF / 6*EE)
WOLHEADER=$(cut -b 1-17 ${FNAM})
 
# valid header?
case "${WOLHEADER}" in
    "FF:FF:FF:FF:FF:FF")    CMDONLAN="start" ;;
    "EE:EE:EE:EE:EE:EE")    CMDONLAN="shutdown" ;;
    "DD:DD:DD:DD:DD:DD")    CMDONLAN="stop" ;;
    "CC:CC:CC:CC:CC:CC")    CMDONLAN="suspend" ;;
    "BB:BB:BB:BB:BB:BB")    CMDONLAN="resume" ;;
    "AA:AA:AA:AA:AA:AA")    CMDONLAN="reset" ;;
    "AB:AB:AB:AB:AB:AB")    CMDONLAN="reboot" ;;
esac
 
if ! [ "${CMDONLAN=}" = "" ]; then
    # 16*MAC
    WOLMAC=$(cut -b 19- ${FNAM})
 
    # MAC we're searching for
    MAC=$(cut -b 19-35 ${FNAM})
 
    # 16*identical MAC = MagicPacket ?
    if [ $(echo ${WOLMAC} | grep -o ${MAC} | wc -l) = 16 ]; then
 
    # search pve for MAC addresses
    # gawk magic thanks to <https://stackoverflow.com/questions/245916/best-way-to-extract-mac-address-from-ifconfigs-output>
    PVEMACS=`grep -r "net[0-9]:" /etc/pve/local/ | grep -ioE "([[:xdigit:]]{1,2}:){5}[[:xdigit:]]{1,2}" | grep -io -m1 "${MAC}"`
 
    # matching MAC?
    if [ "${PVEMACS}" = "${MAC}" ]; then
        WHICHVIRT=$(grep -r -m1 "net[0-9]:" /etc/pve/local/ | grep -i "${MAC}" | awk -F '/' '{print $5}')
        WHICHVMID=$(grep -r -m1 "net[0-9]:" /etc/pve/local/ | grep -i "${MAC}" | awk -F '[/:]' '{print $6}')
        VMFILE=$(find /etc/pve/local/ -name ${WHICHVMID})
        VMNAME=$(grep -m1 "name: " ${VMFILE} | awk {'print $2'})
        VMID=$(echo ${WHICHVMID%.conf})
        if [ "${WHICHVIRT}" = "qemu-server" ]; then
        LOG
        qm sendkey ${VMID} ctrl-alt &
        qm ${CMDONLAN} ${VMID} &
        fi
        if [ "${WHICHVIRT}" = "lxc" ] && ! [ "${CMDONLAN}" = "reset" ]; then
        LOG
        pct ${CMDONLAN} ${VMID} &
        fi
    fi
    fi
fi
 
# remove obsolete/invalid socat file
rm ${FNAM}
done
```

Make it executable

```shell
chmod +x /usr/local/bin/dosthold.sh
```

Create a new file `/etc/systemd/system/dosthol.service` with the following contents:

```ini
[Unit]
Description=dosthol (Do something on LAN)
 
[Service]
ExecStart=/usr/local/bin/dosthold.sh
RestartSec=1
Restart=always
 
[Install]
WantedBy=multi-user.target
```

Start, enable, status the service:

```shell
systemctl enable dosthol.service
systemctl start dosthol.service
systemctl status dosthol.service
```

# Verify

We will use a terminal command to send out a WoL magic packet.

```shell
sudo apt install wakeonlan
wakeonlan ${MAC_ADDRESS}
```

---
date: 2026-03-12T00:00:00-00:00
draft: false
title: "OPNSense Firewal DNS Redirection"
---

This article goes over how to redirect port 53 to local DNS.

# 1. Firewall → Rules → LAN (optional)

Allow DNS requests to your local DNS:       

- Action           : Pass           
- Interface        : LAN            
- Protocol         : TCP/UDP        
- Source           : LAN net        
- Destination      : 192.168.111.2  
- Destination Port : 53             

Block all other DNS:

- Action           : Block   
- Interface        : LAN     
- Protocol         : TCP/UDP 
- Source           : LAN net 
- Destination      : any     
- Destination Port : 53      

Rule order should look like this:

1. Allow LAN → 192.168.111.2 port 53
2. Block LAN → any port 53
3. Default allow LAN → any

# 2. Firewall → NAT → Port Forward

- Interface          : LAN           
- Protocol           : TCP/UDP       
- Source             : LAN net       
- Destination        : !LAN address  
- Destination port   : 53            
- Redirect target IP : 192.168.111.2 
- Redirect port      : 53            

Now this happens:

```
Device → 8.8.8.8
        ↓
Firewall rewrites
        ↓
Device → 192.168.111.2
```
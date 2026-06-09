---
date: 2026-01-29T00:00:00-00:00
draft: false
title: "Adding Firewall to Proxmox LXC Containers"
---

To use the Proxmox firewall at the LXC container level, it must be enabled at multiple layers of the Proxmox stack. Firewall rules are evaluated top-down, so every required scope must be active for LXC-level rules to take effect.

# Required Firewall Configuration

## 1. Data Center Level

The Data Center firewall must be enabled.

⚠️ Before enabling it, ensure inbound traffic is ACCEPTed at this level, or you may lock yourself out of the host.

You can either:

- Add a broad `ACCEPT` rule for incoming traffic, or
- Define more fine-grained rules if you don’t want to allow all inbound connections by default.

## 2. Node Level

The firewall must be enabled on the Proxmox node hosting the LXC container.
This activates firewall processing for workloads running on that node.

## 3. LXC Container Level

The firewall must be enabled explicitly on the LXC container itself.
Without this, container-specific rules will be ignored even if higher levels are enabled.

## 4. LXC Network Interface

The firewall must also be enabled on the LXC network interface (e.g. `net0`).
This is where traffic filtering actually occurs for the container’s network traffic.

# Reiterate

Only when all four layers are enabled will firewall rules applied to an LXC container function as expected.

---
date: 2025-06-05T17:36:22-05:00
draft: false
title: "Homelab #3 - Kubernetes Cluster (Initial Setup)"
---

Homelab Series:

- [Homelab #1 - Humble Beginnings](/tinkering/2024-08-26/)
- [Homelab #2 - Proxmox Cluster](/tinkering/2025-06-04/)
- [Homelab #3 - Kubernetes Cluster (Initial Setup)](/tinkering/2025-06-05/)
- [Homelab #4 - Kubernetes Cluster (Infrastructure Setup)](/tinkering/2025-06-06/)
- [Homelab #5 - Kubernetes Cluster (App Bonanza!!!!!!)](/tinkering/2025-06-08/)

# Kubernetes Cluster (Initial Setup)

Once the Proxmox Cluster has been configured,
we will set up a Kubernetes/k8s cluster on top of it.

Kubernetes is used to run docker containers.

First, we need to know the components of a k8s cluster:
- control-node - manages the state of the cluster 
- worker-node - runs the docker containers

There can be one or more control-nodes in a cluster.

There can be one or more worker-nodes in a cluster.

In my case, I have one control-node and one worker-node on each of my three Proxmox-servers.

# Setup Ubuntu VMs in Proxmox Cluster

To set up a node, we need to set up a Virtual Machine (VM) in Proxmox.

I'll be launching 2 [Ubuntu Server](https://ubuntu.com/download/server) VMs on each of the three Proxmox servers - for a total of 6 VMs.

Since launching one Ubuntu Server takes a while to set up - I recommend creating a [Proxmox template](https://pve.proxmox.com/wiki/VM_Templates_and_Clones) after the first setup and then cloning it 6 times.

# Configuration for Both Control & Worker nodes

Here are some of the several ways in setting up Kubernetes:
- manual
- [k0s](https://docs.k0sproject.io/stable/install/)
- [Talos Linux](https://github.com/siderolabs/talos)

I've opted for the manual route.

For each Ubuntu Server:

#### Ensure Hostname is Unique Across All Nodes
```shell
hostnamectl set-hostname UNIQUE_HOSTNAME_HERE
```

#### Disable Swap
```shell
vim /etc/fstab
# comment out swap
```

#### Enable IPv4 Forward
```shell
vim /etc/sysctl.conf
# Uncomment the next line to enable packet forwarding for IPv4
#net.ipv4.ip_forward=1
```
reboot
```shell
sudo shutdown -r now
```

#### Container Runtime Interface - Installation
```shell
apt-get update
apt-get install -y apt-transport-https ca-certificates curl gpg
 
curl -fsSL https://pkgs.k8s.io/addons:/cri-o:/stable:/v1.30/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/cri-o-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/cri-o-apt-keyring.gpg] https://pkgs.k8s.io/addons:/cri-o:/stable:/v1.30/deb/ /" | tee /etc/apt/sources.list.d/cri-o.list
 
apt-get update
apt-get install -y cri-o
apt-mark hold cri-o
 
systemctl enable --now crio.service
systemctl start crio.service
```

#### Install Tools
```shell
apt-get update
apt-get install -y apt-transport-https ca-certificates curl gpg
```

#### Install Kubeadm Kubelet Kubectl
```shell
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
 
apt-get update
apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
 
systemctl enable --now kubelet
```

# Configuration for the First Control Node

Run in 1 control-node. Replace `--control-plane-endpoint` with actual endpoint.

```shell
kubeadm init --control-plane-endpoint "k8s-control.pve1.lan:6443" --upload-certs --cri-socket=unix:///var/run/crio/crio.sock
```

The output will give you commands for setting up the rest of the control-nodes and worker-nodes.

#### If Root User

Execute the following (if not see output above):

```shell
export KUBECONFIG=/etc/kubernetes/admin.conf
```

#### Install Pod Network (i.e. Container Network Interface)

```shell
kubectl apply -f https://projectcalico.docs.tigera.io/archive/v3.25/manifests/calico.yaml --validate=false
```

#### Test
```shell
> kubectl get nodes
NAME                             STATUS   ROLES           AGE   VERSION
pve1-ubuntu-server-k8s-control   Ready    control-plane   28m   v1.31.0
```

**WAIT TILL STATUS IS READY!!!!!!!!!!!!!!!!!!!!!**

# Joining New Control Planes

On the remaining 2 control-nodes execute the command from the first output - should look something like

```shell
kubeadm join k8s-control.pve1.lan:6443 --token nw4kb4.wnejkwebwjkb4kb4jk4b4 \
    --discovery-token-ca-cert-hash sha256:ed15bjwv3hkj5vw4lhjvhjk6v3hjk6v4h3jk932c39çc923e9c2h392h392h3829 \
    --control-plane --certificate-key 9ed5cabvhjv3jvhjk46vk5hjk4v746k7v45hjk7v54hjkv753hjkv3v42kfpeohi3bc
```

If any of the control-planes are not labelled control-plane like below
```shell
> kubectl get nodes
NAME                          STATUS   ROLES           AGE     VERSION
ubuntu-server-k8s-control-1   Ready    control-plane   23m     v1.31.9
ubuntu-server-k8s-control-2   Ready    control-plane   10m     v1.31.9
ubuntu-server-k8s-control-3   Ready    <none>          4m53s   v1.31.9
```

Then execute the following

```shell
kubectl label node NODE_NAME_HERE node-role.kubernetes.io/control-plane=true
```

# Joining New Workers

On each of the three worker-nodes execute the command from the first output - should look something like

```shell
kubeadm join k8s-control.pve1.lan:6443 --token vo8v1g.x0mo3351gfnduc9t \
    --discovery-token-ca-cert-hash sha256:ed15bjwv3hkj5vw4lhjvhjk6v3hjk6v4h3jk932c39çc923e9c2h392h392h3829
```

In a control plane node label the newly joined worker as a worker

```shell
kubectl label node NODE_NAME_HERE node-role.kubernetes.io/worker=worker
```

# Verify K8s Cluster

Execute in a control node

```shell
kubectl get nodes
```

It should output something like this ALL STATUS=Ready!
```shell
NAME                          STATUS   ROLES           AGE   VERSION
ubuntu-server-k8s-control-1   Ready    control-plane   15d   v1.31.9
ubuntu-server-k8s-control-2   Ready    control-plane   15d   v1.31.9
ubuntu-server-k8s-control-3   Ready    control-plane   15d   v1.31.9
ubuntu-server-k8s-worker-1    Ready    worker          15d   v1.31.9
ubuntu-server-k8s-worker-2    Ready    worker          15d   v1.31.9
ubuntu-server-k8s-worker-3    Ready    worker          15d   v1.31.9
```

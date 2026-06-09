---
date: 2025-06-06T17:36:22-05:00
draft: false
title: "Homelab #4 - Kubernetes Cluster (Infrastructure Setup)"
---

Homelab Series:

- [Homelab #1 - Humble Beginnings](/tinkering/2024-08-26/)
- [Homelab #2 - Proxmox Cluster](/tinkering/2025-06-04/)
- [Homelab #3 - Kubernetes Cluster (Initial Setup)](/tinkering/2025-06-05/)
- [Homelab #4 - Kubernetes Cluster (Infrastructure Setup)](/tinkering/2025-06-06/)
- [Homelab #5 - Kubernetes Cluster (App Bonanza!!!!!!)](/tinkering/2025-06-08/)

# Kubernetes Cluster (Infrastructure Setup)

Table of contents:

- Helm Installation - a package manager for Kubernetes cluster
- MetalLB Installation - enables LoadBalancer Service
- Nginx Ingress Controller Installation - enables Ingress
- Rook Installation - enables resilient storage
- Cert-Manager Installation - handles SSL certs with ease

# Helm Installation

Helm is like a package manager for Kubernetes. This will help make installation of k8s containers easier.

```shell
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

Based on: https://helm.sh/docs/intro/install/

# MetalLB Installation

We will install MetalLB to handle [LoadBalancer Service](https://kubernetes.io/docs/concepts/services-networking/service/#loadbalancer).

Based on: https://metallb.universe.tf/installation/

I've opted for the `Installation by Manifest` method via this command:

```shell
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.15.2/config/manifests/metallb-native.yaml
```

Next I've created the YAML file with the following contents

```yaml # my-ip-address-pool-1.yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: my-ip-address-pool-1
  namespace: metallb-system
spec:
  addresses:
  - 192.168.111.100-192.168.111.199 # CHANGE THIS ACCORDING TO YOUR NETWORK
 ```

Next apply this to your k8s cluster

```shell
kubectl apply -f my-ip-address-pool-1.yaml
```

Create another YAML file with the following contents

```yaml # my-l2-advertisement-1.yaml
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: my-l2-advertisement-1
  namespace: metallb-system
  ```

Apply this as well

```shell
kubectl apply -f my-l2-advertisement-1.yaml
```

You can verify LoadBalancer works by creating one accordingly.

# Nginx-Ingress-Controller Installation

Inginx Ingress Controller enables [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)

Based on: https://kubernetes.github.io/ingress-nginx/deploy/

I've once again opted for the `Installation by Manifest` method via this command:

```shell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.3/deploy/static/provider/cloud/deploy.yaml
```

# Rook Installation

Kubernetes is great for stateless applications. However, deploying stateful applications requires some storage redundancy and Rook greatly simplifies this.

Rook is essentially [Ceph](https://ceph.io/en/) underhood for Kubernetes. Ceph is a resilient storage solution.

Rook installation is based on: https://rook.github.io/docs/rook/latest-release/Getting-Started/quickstart/#prerequisites

I've just followed that and only configured the `Shared Filesystem` part.

# Cert-Manager Installation

Cert Manager helps ease our SSL management.

Based on: https://cert-manager.io/docs/installation/

Install Cert Manager via

```shell
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.2/cert-manager.yaml
```

Next create the following file with:

```yaml # cluster-issuer.yml
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: marcuschiu9@gmail.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

Apply it

```shell
kubectl apply -f cluster-issuer.yml
```

# Conclusion

This pretty much sums up the infrastructure needed to run my future applications :)

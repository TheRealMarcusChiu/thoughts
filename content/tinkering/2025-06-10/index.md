---
date: 2025-06-10T00:00:00-05:00
draft: false
title: "Homelab #6 - Fixing Homebox Perpetual Logouts"
---

Homelab Series:

- [Homelab #1 - Humble Beginnings](/tinkering/2024-08-26/)
- [Homelab #2 - Proxmox Cluster](/tinkering/2025-06-04/)
- [Homelab #3 - Kubernetes Cluster (Initial Setup)](/tinkering/2025-06-05/)
- [Homelab #4 - Kubernetes Cluster (Infrastructure Setup)](/tinkering/2025-06-06/)
- [Homelab #5 - Kubernetes Cluster (App Bonanza!!!!!!)](/tinkering/2025-06-08/)

# Fixing Homebox Perpetual Logouts

What is [Homebox](https://github.com/sysadminsmedia/homebox)? Well it's a simple home item manager.

I wanted to try so I've installed it.

I've registered, logged in, created my first item (my desktop), uploaded a picture of it, and clicked (Create).

IT LOGGED ME OUT.

Okay that's weird. So I've logged back in and redid the item creation process..

LOGGED ME OUT AGAIN.

I did this sooo many times.... So I thought maybe there's a bug with this Homebox.

I've Google this and found nothing to help me because I've installed Homebox on Kubernetes.

Hmmmmmm.

I've refreshed my Homebox several times and it bounces between the login screen and the screen that appears after you logged in....

Weird... maybe it has to deal with sticky sessions since I have 2 containers running for every app on Kubernetes.

That worked.

Here's how to add sticky sessions (assuming you have [Nginx Ingress Controller setup](/tinkering/2025-06-06/#nginx-ingress-controller-installation))

These are the following lines to add

```yaml
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/session-cookie-name: "hello-cookie"
nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
nginx.ingress.kubernetes.io/ssl-redirect: "false"
nginx.ingress.kubernetes.io/affinity-mode: persistent
nginx.ingress.kubernetes.io/session-cookie-hash: sha1
```

We will add these lines into your ingress workload, such as

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: homebox
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "hello-cookie"
    nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/affinity-mode: persistent
    nginx.ingress.kubernetes.io/session-cookie-hash: sha1
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - homebox.lan
    secretName: tls-homebox
  rules:
  - host: homebox.lan
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: homebox
            port:
              number: 80
```

Apply this and you're done!

```shell
kubectl apply -f ingress.yml
```

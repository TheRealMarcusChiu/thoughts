---
date: 2025-06-12T00:00:00-05:00
draft: false
title: "Making This Website HTTPS"
---

For the longest time this site has been in HTTP mode. It's time to HTTPS it.

We will be using Let's Encrypt to issue a free SSL certificate for the following domains:
- marcuschiu.com
- *.marcuschiu.com

The latter domain is a wildcard domain and this allows any sub-domain to be encrypted with SSL all in one go (e.g. [www.marcuschiu.com](https://www.marcuschiu.com), [thoughts.marcuschiu.com](https://thoughts.marcuschiu.com), etc).

# Install Dependencies

```shell
sudo yum install python3 python-devel augeas-devel gcc
```

# Set up a Python virtual environment

```shell
sudo python3 -m venv /opt/certbot/
sudo /opt/certbot/bin/pip install --upgrade pip
```

# Install Certbot

```shell
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -s /opt/certbot/bin/certbot /usr/bin/certbot
```

# Install DNS Plugin For AWS Route53

```shell
sudo /opt/certbot/bin/pip install certbot-dns-route53
```

# Use Certbot to Obtain Certificate

```shell
sudo certbot certonly --dns-route53 -d "marcuschiu.com" -d "*.marcuschiu.com"
```

# Configure Nginx to Point to Issued Certificates

```nginx configuration
ssl_certificate     /etc/letsencrypt/live/marcuschiu.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/marcuschiu.com/privkey.pem;
  
server {
    listen 443 ssl;
    server_name marcuschiu.com www.marcuschiu.com;
    #...
}
  
server {
    listen 443 ssl;
    server_name confluence.marcuschiu.com;
    #...
}
  
# more https servers
  
# redirect HTTP to HTTPS
server {
    listen 80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}
```

# Setup Auto Renewal Process

```shell
echo "0 0,12 * * * root /opt/certbot/bin/python -c 'import random; import time; time.sleep(random.random() * 3600)' && sudo certbot renew -q" | sudo tee -a /etc/crontab > /dev/null
```

# Monthly Upgrade

```shell
sudo /opt/certbot/bin/pip install --upgrade certbot certbot-nginx certbot-dns-route53
```

#! /bin/bash

ssh my-websites << EOF
  cd /root/thoughts
  git pull --rebase
  systemctl restart thoughts-admin.service
EOF


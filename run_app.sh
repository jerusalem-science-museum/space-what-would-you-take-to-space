#!/bin/bash

cd /home/mada/Documents/what-would-you-take-to-space

source .venv/bin/activate
# Start Flask app in background with nohup
nohup flask run > flask.log 2>&1 &

# Wait for port 5000 to be available
echo "Waiting for Flask app to start on port 5000..."
until nc -z localhost 5000; do
  sleep 1
done
echo "Flask app is ready!"

# Open chromium in kiosk mode
chromium \
  --kiosk \
  --password-store=basic \
  --no-sandbox \
  --disable-pinch \
  --disable-dev-shm-usage \
  --disable-gpu-sandbox \
  --disable-background-timer-throttling \
  http://localhost:5000 &

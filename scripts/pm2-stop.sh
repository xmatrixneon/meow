#!/bin/bash

# PM2 Stop Script
# Usage: ./scripts/pm2-stop.sh

echo "🛑 Stopping MeowSMS PM2 processes..."

# Stop all apps
pm2 stop ecosystem.config.js

echo ""
echo "✅ All processes stopped!"
echo "   - Restart: pm2 restart ecosystem.config.js"
echo "   - Delete: pm2 delete ecosystem.config.js"

#!/bin/bash

# PM2 Restart Script
# Usage: ./scripts/pm2-restart.sh

echo "🔄 Restarting MeowSMS PM2 processes..."

# Restart all apps
pm2 restart ecosystem.config.js

# Show status
pm2 status

echo ""
echo "✅ All processes restarted!"
echo "   - View logs: pm2 logs"
echo "   - Monitor: pm2 monit"

#!/bin/bash

# PM2 Reload Script (Zero-downtime restart for Next.js cluster)
# Usage: ./scripts/pm2-reload.sh

echo "🔄 Zero-downtime reload of MeowSMS web cluster..."

# Reload web instances only (not poller)
pm2 reload meowsms-web

# Show status
pm2 status

echo ""
echo "✅ Web cluster reloaded (poller unchanged)!"
echo "   - Full restart: ./scripts/pm2-restart.sh"
echo "   - View logs: pm2 logs"

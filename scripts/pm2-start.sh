#!/bin/bash

# PM2 Start Script
# Usage: ./scripts/pm2-start.sh [environment]
# Default environment: production

ENV=${1:-production}

echo "🚀 Starting MeowSMS PM2 processes (env: $ENV)..."

# Create logs directory if not exists
mkdir -p logs

# Start all apps
pm2 start ecosystem.config.js --env $ENV

# Show status
pm2 status

echo ""
echo "✅ All processes started!"
echo "   - View logs: pm2 logs"
echo "   - Monitor: pm2 monit"
echo "   - Save config: pm2 save"

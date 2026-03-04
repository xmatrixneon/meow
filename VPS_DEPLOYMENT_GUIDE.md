# MeowSMS VPS Deployment Guide

This guide provides step-by-step instructions for deploying the MeowSMS application to a VPS (Virtual Private Server).

## Prerequisites

### 1. VPS Requirements
- **Operating System**: Ubuntu 20.04/22.04 LTS (recommended)
- **Minimum Resources**:
  - 2 GB RAM
  - 2 vCPU cores
  - 20 GB SSD storage
- **Network**: Public IP address with ports 80, 443, and 3000 accessible

### 2. Domain Setup (Optional but Recommended)
- Register a domain name (e.g., `meowsms.com`)
- Point DNS A record to your VPS IP address
- Allow time for DNS propagation (up to 24 hours)

## Step 1: Initial VPS Setup

### Connect to your VPS
```bash
ssh root@your_vps_ip
```

### Update system packages
```bash
apt update && apt upgrade -y
```

### Install essential tools
```bash
apt install -y curl wget git build-essential
```

## Step 2: Install Node.js and npm

### Install Node.js 20.x (LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### Verify installation
```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

## Step 3: Install and Configure PostgreSQL

### Install PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
```

### Start and enable PostgreSQL
```bash
systemctl start postgresql
systemctl enable postgresql
```

### Create database and user
```bash
sudo -u postgres psql
```

Inside PostgreSQL shell:
```sql
CREATE DATABASE meowsms;
CREATE USER meowsms WITH PASSWORD 'Stark++@8434311';
GRANT ALL PRIVILEGES ON DATABASE meowsms TO meowsms;
ALTER DATABASE meowsms OWNER TO meowsms;
\q
```

### Configure PostgreSQL for remote access (optional)
Edit `/etc/postgresql/*/main/postgresql.conf`:
```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```
Change:
```
listen_addresses = 'localhost'  # Change to '*' for remote access
```

Edit `/etc/postgresql/*/main/pg_hba.conf`:
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```
Add:
```
host    meowsms     meowsms     0.0.0.0/0    md5
```

Restart PostgreSQL:
```bash
systemctl restart postgresql
```

## Step 4: Install PM2 Process Manager

```bash
npm install -g pm2
```

## Step 5: Clone and Setup Application

### Clone the repository
```bash
cd /opt
git clone https://github.com/xmatrixneon/meow.git meowsms
cd meowsms
```

### Install dependencies
```bash
npm install
```

### Install Prisma CLI globally
```bash
npm install -g prisma
```

## Step 6: Configure Environment Variables

### Create production environment file
```bash
cp .env .env.production
nano .env.production
```

### Update environment variables
Replace the values with your production configuration:

```env
# Production PostgreSQL database
DATABASE_URL=postgresql://meowsms:your_secure_password@localhost:5432/meowsms

# Better Auth - Generate a new secret
BETTER_AUTH_SECRET='generate_a_secure_random_string_here'

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_BOT_USERNAME="your_bot_username"

# Production URLs (use your domain)
BETTER_AUTH_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Optional: External API credentials
# BHARATPE_MERCHANT_ID=your_merchant_id
# BHARATPE_TOKEN=your_token
```

### Generate a secure BETTER_AUTH_SECRET
```bash
openssl rand -base64 32
```

## Step 7: Database Setup

### Run Prisma migrations
```bash
npx prisma migrate deploy
```

### Generate Prisma client
```bash
npx prisma generate
```

### Seed initial data (if needed)
```bash
npm run seed:bharatpe
```

## Step 8: Build the Application

```bash
npm run build
```

## Step 9: Configure PM2 for Production

### Create PM2 ecosystem file for production
```bash
cp ecosystem.config.js ecosystem.config.production.js
```

Update the production config if needed (adjust instances based on your VPS resources).

### Start the application with PM2
```bash
npm run build  # Ensure fresh build
./scripts/pm2-start.sh production
```

### Save PM2 configuration
```bash
pm2 save
pm2 startup
```

## Step 10: Configure Nginx as Reverse Proxy (Recommended)

### Install Nginx
```bash
apt install -y nginx
```

### Create Nginx configuration
```bash
nano /etc/nginx/sites-available/meowsms
```

Add the following configuration (replace `yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Certificate (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Static files
    location /_next/static {
        proxy_cache_valid 200 60m;
        proxy_pass http://localhost:3000;
    }
    
    # API routes
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Enable the site
```bash
ln -s /etc/nginx/sites-available/meowsms /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl restart nginx
```

## Step 11: Install SSL Certificate with Certbot

### Install Certbot
```bash
apt install -y certbot python3-certbot-nginx
```

### Obtain SSL certificate
```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Auto-renewal setup
```bash
certbot renew --dry-run
```

## Step 12: Configure Firewall

### Enable UFW firewall
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 3000  # For direct access if needed
ufw enable
```

### Check firewall status
```bash
ufw status
```

## Step 13: Application Monitoring

### View PM2 logs
```bash
pm2 logs
```

### Monitor application status
```bash
pm2 monit
```

### Check application health
```bash
curl http://localhost:3000/api/health
```

## Step 14: Update Application

When you need to update the application:

```bash
cd /opt/meowsms
git pull origin main
npm install
npm run build
pm2 restart all
```

## Step 15: Backup Strategy

### Database backup script
Create `/opt/backup-db.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/meowsms_$DATE.sql"

mkdir -p $BACKUP_DIR
sudo -u postgres pg_dump meowsms > $BACKUP_FILE
gzip $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

Make it executable:
```bash
chmod +x /opt/backup-db.sh
```

### Schedule daily backups
```bash
crontab -e
```
Add:
```
0 2 * * * /opt/backup-db.sh
```

## Troubleshooting

### Common Issues

1. **Application won't start**
   ```bash
   pm2 logs meowsms-web
   pm2 logs meowsms-poller
   ```

2. **Database connection issues**
   ```bash
   sudo -u postgres psql -d meowsms
   ```

3. **Port already in use**
   ```bash
   netstat -tulpn | grep :3000
   ```

4. **Build errors**
   ```bash
   rm -rf .next
   npm run build
   ```

5. **Environment variables not loading**
   ```bash
   pm2 restart all --update-env
   ```

### Log Locations
- Application logs: `/opt/meowsms/logs/`
- PM2 logs: `pm2 logs`
- Nginx logs: `/var/log/nginx/`
- PostgreSQL logs: `/var/log/postgresql/`

## Security Considerations

1. **Change default passwords**: Always use strong, unique passwords
2. **Keep system updated**: Regular security updates
3. **Use SSH keys**: Disable password authentication for SSH
4. **Regular backups**: Implement automated backup strategy
5. **Monitor logs**: Set up log monitoring for suspicious activity
6. **Rate limiting**: Consider implementing rate limiting for API endpoints
7. **DDoS protection**: Use Cloudflare or similar service for production

## Performance Optimization

1. **Database indexing**: Ensure proper indexes on frequently queried columns
2. **Caching**: Implement Redis for session and data caching
3. **CDN**: Use CDN for static assets
4. **Load balancing**: For high traffic, consider multiple instances with load balancer
5. **Database connection pooling**: Configure Prisma connection pool

## Support

For issues with the application:
- Check application logs: `pm2 logs`
- Review error messages in browser console
- Check database connectivity
- Verify environment variables are correctly set

For VPS/server issues:
- Check system logs: `journalctl -xe`
- Verify service status: `systemctl status nginx postgresql`
- Check disk space: `df -h`
- Monitor resource usage: `htop`

## Next Steps

1. **Configure Telegram Bot**: Update webhook to point to your domain
2. **Set up payment gateway**: Configure BharatPe or other payment providers
3. **Implement monitoring**: Set up monitoring with UptimeRobot or similar
4. **Enable analytics**: Add Google Analytics or similar
5. **Set up email notifications**: Configure email service for alerts

Remember to test thoroughly before going live with real users!
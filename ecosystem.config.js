/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs
 *   pm2 monit
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'meowsms-web',
      script: './node_modules/.bin/next',
      args: 'start',
      cwd: './',
      instances: 3, // Run 3 instances of Next.js
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      // Merge logs
      out_file: './logs/combined-out.log',
      error_file: './logs/combined-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      log_file_size: '10M',
      merge_logs: true,
    },
    {
      name: 'meowsms-poller',
      script: './dist/scripts/fetch.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        POLL_INTERVAL: '5000', // 5 seconds between SMS polls
      },
      env_production: {
        NODE_ENV: 'production',
        POLL_INTERVAL: '5000',
      },
      env_development: {
        NODE_ENV: 'development',
        POLL_INTERVAL: '10000', // Slower polling in dev
      },
      // Merge logs
      out_file: './logs/poller-out.log',
      error_file: './logs/poller-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      log_file_size: '5M',
      merge_logs: true,
    },
  ],
};

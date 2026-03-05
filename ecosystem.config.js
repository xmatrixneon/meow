module.exports = {
  apps: [
    /*
    |--------------------------------------------------------------------------
    | Next.js Web Instance 1 (Port 3000)
    |--------------------------------------------------------------------------
    */
    {
      name: "meowsms-web-1",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Next.js Web Instance 2 (Port 3001)
    |--------------------------------------------------------------------------
    */
    {
      name: "meowsms-web-2",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        HOST: "0.0.0.0",
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Next.js Web Instance 3 (Port 3002)
    |--------------------------------------------------------------------------
    */
    {
      name: "meowsms-web-3",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3002,
        HOST: "0.0.0.0",
      },
    },

    /*
    |--------------------------------------------------------------------------
    | SMS Fetch Worker (TSX)
    |--------------------------------------------------------------------------
    */
    {
      name: "meowsms-fetch",
      script: "npx",
      args: "tsx scripts/fetch.ts",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
      {
      name: 'meowsms-bot',
      script: 'npx',
      args: 'tsx scripts/bot-polling.ts',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

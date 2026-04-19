/**
 * PM2 ecosystem - proces manager pro produkci
 * ----------------------------------------------------------------------------
 * Spuštění:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup    # trvalé zapnutí po rebootu
 *
 * Logy:    pm2 logs
 * Restart: pm2 restart all
 * Status:  pm2 status
 */

module.exports = {
  apps: [
    {
      name: 'stanek-os-backend',
      script: 'backend/src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        TZ: 'Europe/Prague',
      },
      instances: 1,              // jednoduchý single-instance (SQLite/PG stačí)
      exec_mode: 'fork',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '500M',
      log_file: 'logs/backend.log',
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      name: 'stanek-os-agent',
      script: 'agent/inventoryAgent.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        TZ: 'Europe/Prague',
      },
      instances: 1,
      restart_delay: 5000,
      max_restarts: 5,
      min_uptime: '60s',
      max_memory_restart: '300M',
      log_file: 'logs/agent.log',
      error_file: 'logs/agent-error.log',
      out_file: 'logs/agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};

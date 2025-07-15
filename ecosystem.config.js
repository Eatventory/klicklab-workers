module.exports = {
  apps: [{
    name: 'klicklab-worker',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      CLICKHOUSE_HOST: '10.0.3.77',
      CLICKHOUSE_PORT: '8123',
      CLICKHOUSE_USERNAME: 'default',
      CLICKHOUSE_PASSWORD: '',
      CLICKHOUSE_DATABASE: 'klicklab'
    },
    env_file: '.env',
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
}; 
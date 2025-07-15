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
      CLICKHOUSE_PORT: 8123,  // 문자열에서 숫자로 변경
      CLICKHOUSE_USERNAME: 'default',
      CLICKHOUSE_PASSWORD: '',
      CLICKHOUSE_DATABASE: 'klicklab',
      LOG_LEVEL: 'info',
      WORKER_TIMEOUT: 300000,
      WORKER_MAX_RETRIES: 3
    },
    env_file: '.env',  // .env 파일도 유지
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // PM2가 환경변수를 덮어쓰지 않도록 설정
    merge_logs: true,
    kill_timeout: 5000
  }]
}; 
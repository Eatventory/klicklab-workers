const { createClient } = require("@clickhouse/client");

// 클러스터 환경을 위한 ClickHouse 클라이언트 설정
const clickhouse = createClient({
  host: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USERNAME,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: "klicklab",
  // 클러스터 환경 최적화 설정
  settings: {
    // 쿼리 타임아웃 (클러스터 환경에서 더 오래 걸릴 수 있음)
    max_execution_time: 300, // 5분
    // 메모리 제한
    max_memory_usage: 2 * 1024 * 1024 * 1024, // 2GB
    // 병렬 처리
    max_threads: 4,
    // 네트워크 타임아웃
    connect_timeout: 10,
    send_receive_timeout: 300,
  },
  // 연결 풀 설정
  session_id: 'klicklab-worker',
  // 로깅 설정
  log: {
    level: 'info'
  }
});

module.exports = clickhouse; 
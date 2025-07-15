const { createClient } = require("@clickhouse/client");

// 환경변수 확인
const host = process.env.CLICKHOUSE_HOST || '10.0.3.77';
const port = process.env.CLICKHOUSE_PORT || '8123';
const username = process.env.CLICKHOUSE_USERNAME || 'default';
const password = process.env.CLICKHOUSE_PASSWORD || '';
const database = process.env.CLICKHOUSE_DATABASE || 'klicklab';

console.log('ClickHouse 설정:', { host, port, username, database });

const clickhouse = createClient({
  url: `http://${host}:${port}`,
  username: username,
  password: password,
  database: database,
});

module.exports = clickhouse;

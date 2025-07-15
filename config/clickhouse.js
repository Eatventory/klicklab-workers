const { createClient } = require("@clickhouse/client");

const clickhouse = createClient({
  url: `http://${process.env.CLICKHOUSE_HOST || '10.0.3.77'}:${process.env.CLICKHOUSE_PORT || '8123'}`,
  username: process.env.CLICKHOUSE_USERNAME || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || "klicklab",
});

module.exports = clickhouse;

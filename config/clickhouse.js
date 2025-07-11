const { createClient } = require("@clickhouse/client");

const clickhouse = createClient({
  host: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USERNAME,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: "klicklab",
});

module.exports = clickhouse;

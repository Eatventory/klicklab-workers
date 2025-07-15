require('dotenv').config();
/* hourly_page_stats → daily_page_stats */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

const input = process.argv[2];
let start, end;

if (input) {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (isDate) {
    start = dayjs(input).startOf("day");
    end = start.add(1, "day");
  } else {
    console.error("❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD");
    process.exit(1);
  }
} else {
  end = dayjs().startOf("day");
  start = end.subtract(1, "day");
}

const query = `
  INSERT INTO klicklab.daily_page_stats
  SELECT
    toDate(e.date_time) AS date,
    e.page_path,
    sum(e.page_views) AS page_views,
    sum(e.page_exits) AS page_exits,
    if(sum(e.page_views) = 0, 0, round(sum(e.page_exits) / sum(e.page_views), 3)) AS drop_rate,
    [''] AS "next_pages.to",
    [0] AS "next_pages.count",
    e.sdk_key,
    round(avg(e.avg_time_on_page_seconds), 2) AS avg_time_on_page_seconds
  FROM klicklab.hourly_page_stats e
  WHERE e.date_time >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
    AND e.date_time < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
  GROUP BY date, e.page_path, e.sdk_key
  ORDER BY date, e.page_path, e.sdk_key;
`;

function run() {
  clickhouse.query(query, (err, result) => {
    if (err) {
      console.error("❌ 집계 실패:", err.message);
    } else {
      console.log(`✅ 집계 완료: ${start.format()} ~ ${end.format()}`);
    }
  });
}

run();

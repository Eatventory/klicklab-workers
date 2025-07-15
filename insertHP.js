require('dotenv').config();
/* minutes_page_stats → hourly_page_stats */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

const input = process.argv[2];
let start, end;

if (input) {
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input);
  const isDateHour = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(input);
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);

  if (isDateTime) {
    start = dayjs(input);
    end = start.add(1, "hour");
  } else if (isDateHour) {
    start = dayjs(input);
    end = start.add(1, "hour");
  } else if (isDate) {
    start = dayjs(input).startOf("day");
    end = start.add(1, "day");
  } else {
    console.error(
      "❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD, YYYY-MM-DDTHH, 또는 YYYY-MM-DDTHH:mm"
    );
    process.exit(1);
  }
} else {
  end = dayjs().startOf("hour");
  start = end.subtract(1, "hour");
}

const query = `
  INSERT INTO klicklab.hourly_page_stats
  SELECT
    grouped_time AS date_time,
    page_path,
    page_views,
    page_exits,
    drop_rate,
    next_pages_to,
    next_pages_count,
    sdk_key,
    avg_time_on_page_seconds
  FROM (
    SELECT
      toStartOfHour(date_time) AS grouped_time,
      page_path,
      sdk_key,
      sum(page_views) AS page_views,
      sum(page_exits) AS page_exits,
      avg(drop_rate) AS drop_rate,
      any(\`next_pages.to\`) AS next_pages_to,
      any(\`next_pages.count\`) AS next_pages_count,
      avg(avg_time_on_page_seconds) AS avg_time_on_page_seconds
    FROM klicklab.minutes_page_stats
    WHERE date_time >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
      AND date_time < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
    GROUP BY
      toStartOfHour(date_time), page_path, sdk_key
  ) AS aggregated
  ORDER BY
    grouped_time, page_path, sdk_key;
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

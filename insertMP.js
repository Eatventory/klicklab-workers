require('dotenv').config();
/* events → minutes_page_stats */
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
    end = start.add(10, "minute");
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
  end = dayjs()
    .startOf("minute")
    .subtract(dayjs().minute() % 10, "minute");
  start = end.subtract(10, "minute");
}

const query = `
  INSERT INTO klicklab.minutes_page_stats
  SELECT
    toStartOfTenMinutes(timestamp) AS date_time,
    page_path,
    count(*) AS page_views,
    sum(is_exit) AS page_exits,
    if(count() = 0, 0, round(sum(is_exit) / count(), 3)) AS drop_rate,
    [''] AS "next_pages.to",
    [0] AS "next_pages.count",
    sdk_key,
    round(avg(time_on_page_seconds), 2) AS avg_time_on_page_seconds
  FROM (
    SELECT
      timestamp,
      page_path,
      sdk_key,
      if(lead(page_path, 1) OVER (PARTITION BY session_id ORDER BY timestamp) IS NULL, 1, 0) AS is_exit,
      time_on_page_seconds
    FROM (
      SELECT
        timestamp,
        page_path,
        sdk_key,
        session_id,
        dateDiff('second', timestamp, lead(timestamp, 1) OVER (PARTITION BY session_id ORDER BY timestamp)) AS time_on_page_seconds
      FROM klicklab.events
      WHERE timestamp >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
        AND timestamp < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
        AND page_path != ''
    )
  )
  GROUP BY date_time, page_path, sdk_key
  ORDER BY date_time, page_path, sdk_key;
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

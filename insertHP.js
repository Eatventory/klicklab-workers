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
    toStartOfHour(e.date_time) AS date_time,
    count(DISTINCT e.client_id) AS visitors,
    count(DISTINCT if(past.client_id IS NULL, e.client_id, NULL)) AS new_visitors,
    count(DISTINCT if(past.client_id IS NOT NULL, e.client_id, NULL)) AS existing_visitors,
    if(
      isFinite(avgIf(e.session_duration, e.session_duration > 0)),
      toUInt32(avgIf(e.session_duration, e.session_duration > 0)),
      0
    ) AS avg_session_seconds,
    e.sdk_key
  FROM (
    SELECT
      client_id,
      date_time,
      sdk_key,
      session_duration
    FROM klicklab.minutes_page_stats
    WHERE date_time >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
      AND date_time <  toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
  ) AS e
  LEFT JOIN (
    SELECT
      DISTINCT client_id,
      sdk_key
    FROM klicklab.minutes_page_stats
    WHERE date_time < toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
  ) AS past
  ON e.client_id = past.client_id AND e.sdk_key = past.sdk_key
  GROUP BY
    date_time, e.sdk_key
  ORDER BY
    date_time, e.sdk_key;
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

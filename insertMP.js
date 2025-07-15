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
    toStartOfTenMinutes(e.timestamp) AS date_time,
    count(DISTINCT e.client_id) AS visitors,
    count(DISTINCT if(past.client_id IS NULL, e.client_id, NULL)) AS new_visitors,
    count(DISTINCT if(past.client_id IS NOT NULL, e.client_id, NULL)) AS existing_visitors,
    if(
      isFinite(avgIf(e.session_duration, e.session_duration > 0)),
      toUInt32(avgIf(e.session_duration, e.session_duration > 0)),
      0
    ) AS avg_session_seconds,
    e.sdk_key,
    'page_stats' AS stat_type,
    '10min' AS time_unit,
    toDate(e.timestamp) AS date
  FROM (
    SELECT
      client_id,
      timestamp,
      sdk_key,
      dateDiff(
        'second',
        min(timestamp) OVER (PARTITION BY client_id, sdk_key),
        max(timestamp) OVER (PARTITION BY client_id, sdk_key)
      ) AS session_duration
    FROM klicklab.events
    WHERE timestamp >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
      AND timestamp <  toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
  ) AS e
  LEFT JOIN (
    SELECT
      DISTINCT client_id,
      sdk_key
    FROM klicklab.events
    WHERE timestamp < toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
  ) AS past
  ON e.client_id = past.client_id AND e.sdk_key = past.sdk_key
  GROUP BY
    date_time, e.sdk_key, stat_type, time_unit, date
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

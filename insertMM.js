/* events → minutes_metrics */
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
  INSERT INTO klicklab.minutes_metrics
  SELECT
    toStartOfTenMinutes(timestamp) AS date_time,
    countIf(event_name = 'auto_click') AS clicks,
    count(DISTINCT client_id) AS visitors,
    count(DISTINCT if(toDate(timestamp) = first_seen, client_id, NULL)) AS new_visitors,
    count(DISTINCT if(toDate(timestamp) != first_seen, client_id, NULL)) AS existing_visitors,
    sdk_key
  FROM (
  SELECT
    client_id,
    timestamp,
    sdk_key,
    event_name,
    min(toDate(timestamp)) OVER (PARTITION BY client_id, sdk_key) AS first_seen
  FROM klicklab.events
  WHERE timestamp >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
    AND timestamp < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
  )
  GROUP BY
    date_time, sdk_key
  ORDER BY
    date_time, sdk_key;
`;

async function run() {
  try {
    await clickhouse.command({ query });
    console.log(`✅ 집계 완료: ${start.format()} ~ ${end.format()}`);
  } catch (err) {
    console.error("❌ 집계 실패:", err.message);
  }
}

run();

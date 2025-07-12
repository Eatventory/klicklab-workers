/* events → minutes_page_stats */
const clickhouse = require('./config/clickhouse');
const dayjs = require('dayjs');

const input = process.argv[2];
let start, end;

if (input) {
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input);
  if (!isDateTime) {
    console.error("❌ 형식 오류. 예: 2025-07-12T14:30");
    process.exit(1);
  }
  start = dayjs(input);
  end = start.add(10, 'minute');
} else {
  end = dayjs()
    .startOf('minute')
    .subtract(dayjs().minute() % 10, 'minute');
  start = end.subtract(10, 'minute');
}

const query = `
  INSERT INTO klicklab.minutes_page_stats
  WITH base AS (
    SELECT
      toStartOfTenMinutes(timestamp) AS date_time,
      page_path,
      sdk_key,
      lead(page_path, 1) OVER (PARTITION BY session_id ORDER BY timestamp) AS next_page,
      if(lead(page_path, 1) OVER (PARTITION BY session_id ORDER BY timestamp) IS NULL, 1, 0) AS is_exit
    FROM klicklab.events
    WHERE timestamp >= toDateTime('${start.format('YYYY-MM-DD HH:mm:ss')}')
      AND timestamp < toDateTime('${end.format('YYYY-MM-DD HH:mm:ss')}')
      AND page_path != ''
  )

  SELECT
    date_time,
    page_path,
    count(*) AS page_views,
    sum(is_exit) AS page_exits,
    if(count() = 0, 0, round(sum(is_exit) / count(), 3)) AS drop_rate,
    groupArray(next_page) AS "next_pages.to",
    groupArray(to_count) AS "next_pages.count",
    sdk_key
  FROM (
    SELECT
      *,
      count() OVER (PARTITION BY date_time, page_path, sdk_key, next_page) AS to_count
    FROM base
  )
  GROUP BY date_time, page_path, sdk_key
  ORDER BY date_time ASC;
`;

async function run() {
  try {
    await clickhouse.command({ query });
    console.log(`✅ minutes_page_stats 집계 완료: ${start.format()} ~ ${end.format()}`);
  } catch (err) {
    console.error('❌ 집계 실패:', err.message);
  }
}

run();

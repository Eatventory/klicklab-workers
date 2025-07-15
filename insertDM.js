require('dotenv').config();
/* hourly_metrics → daily_metrics */
const clickhouse = require('./config/clickhouse');
const dayjs = require('dayjs');

const input = process.argv[2];
let start, end;

if (input) {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (!isDate) {
    console.error("❌ 날짜 형식이 잘못되었습니다. 예: YYYY-MM-DD");
    process.exit(1);
  }
  start = dayjs(input).startOf('day');
  end = start.add(1, 'day');
} else {
  end = dayjs().startOf('day');
  start = end.subtract(1, 'day');
}

const query = `
  INSERT INTO klicklab.daily_metrics
  SELECT
    toDate(date_time) AS date,
    sum(clicks) AS clicks,
    sum(visitors) AS visitors,
    sum(existing_visitors) AS existing_visitors,
    sum(new_visitors) AS new_visitors,
    toUInt32(avg(avg_session_seconds)) AS avg_session_seconds,
    sdk_key
  FROM klicklab.hourly_metrics
  WHERE date_time >= toDateTime('${start.format('YYYY-MM-DD')} 00:00:00')
    AND date_time < toDateTime('${end.format('YYYY-MM-DD')} 00:00:00')
  GROUP BY date, sdk_key
  ORDER BY date, sdk_key;
`;

async function run() {
  try {
    await clickhouse.command({ query });
    console.log(`✅ 일간 집계 완료: ${start.format('YYYY-MM-DD')}`);
  } catch (err) {
    console.error('❌ 집계 실패:', err.message);
  }
}

run();

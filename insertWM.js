/* daily_metrics → weekly_metrics */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

const input = process.argv[2];
let start, end;

if (input) {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (!isDate) {
    console.error("❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD");
    process.exit(1);
  }
  start = dayjs(input);
  end = start.add(7, "day");
} else {
  // 기본값: 최근 7일
  end = dayjs().startOf("day");
  start = end.subtract(7, "day");
}

const query = `
  INSERT INTO klicklab.weekly_metrics
  SELECT
    toDate('${start.format("YYYY-MM-DD")}') AS date,
    sum(clicks) AS clicks,
    sum(visitors) AS visitors,
    sum(existing_visitors) AS existing_visitors,
    sum(new_visitors) AS new_visitors,
    toUInt32(avg(avg_session_seconds)) AS avg_session_seconds,
    sdk_key
  FROM klicklab.daily_metrics
  WHERE date >= toDate('${start.format("YYYY-MM-DD")}')
    AND date < toDate('${end.format("YYYY-MM-DD")}')
  GROUP BY sdk_key
  ORDER BY sdk_key;
`;

async function run() {
  try {
    await clickhouse.command({ query });
    console.log(
      `✅ [${start.format()} ~ ${end
        .subtract(1, "day")
        .format()}] 주간 집계 완료`
    );
  } catch (err) {
    console.error("❌ 집계 실패:", err.message);
  }
}

run();

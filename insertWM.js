require('dotenv').config();

// 한국 시간대 설정
process.env.TZ = 'Asia/Seoul';

/* daily_metrics → weekly_metrics */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

const input = process.argv[2];
let start, end;

if (input) {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (isDate) {
    start = dayjs(input).startOf("week");
    end = start.add(1, "week");
  } else {
    console.error("❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD");
    process.exit(1);
  }
} else {
  end = dayjs().startOf("week");
  start = end.subtract(1, "week");
}

const query = `
  INSERT INTO klicklab.weekly_metrics
  SELECT
    toStartOfWeek(date) AS week,
    sum(clicks) AS clicks,
    count(DISTINCT visitors) AS visitors,
    sum(new_visitors) AS new_visitors,
    sum(existing_visitors) AS existing_visitors,
    if(
      isFinite(avg(avg_session_seconds)),
      toUInt32(avg(avg_session_seconds)),
      0
    ) AS avg_session_seconds,
    sdk_key
  FROM klicklab.daily_metrics
  WHERE date >= toDate('${start.format("YYYY-MM-DD")}')
    AND date < toDate('${end.format("YYYY-MM-DD")}')
  GROUP BY week, sdk_key
  ORDER BY week, sdk_key;
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

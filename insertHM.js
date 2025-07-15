require('dotenv').config();

// 한국 시간대 설정
process.env.TZ = 'Asia/Seoul';

/* minutes_metrics → hourly_metrics */
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
  // 1시간 지연: 현재 01:00라면 23:00~00:00 구간을 집계  
  end = dayjs().startOf("hour").subtract(1, "hour");
  start = end.subtract(1, "hour");
}

const query = `
  INSERT INTO klicklab.hourly_metrics
  SELECT
    toStartOfHour(date_time) AS date_time,
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
  FROM klicklab.minutes_metrics
  WHERE date_time >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
    AND date_time < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
  GROUP BY date_time, sdk_key
  ORDER BY date_time, sdk_key;
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

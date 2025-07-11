/* minutes_metrics → hourly_metrics */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

async function runHourlyAggregation() {
  // const end = dayjs().startOf("hour");
  // const start = end.subtract(1, "hour");
  const input = process.argv[2];
  let start, end;

  if (input) {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
    const isDateHour = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(input);

    if (isDate) {
      start = dayjs(input).startOf('day');
      end = start.add(1, 'day');
    } else if (isDateHour) {
      start = dayjs(input);
      end = start.add(1, 'hour');
    } else {
      console.error("❌ 날짜 형식이 잘못되었습니다. 예: YYYY-MM-DD 또는 YYYY-MM-DDTHH");
      process.exit(1);
    }
  } else {
    // 기본: 직전 1시간
    end = dayjs().startOf('hour');
    start = end.subtract(1, 'hour');
  }

  const query = `
    INSERT INTO klicklab.hourly_metrics
    SELECT
      toStartOfHour(date_time) AS date_time,
      sum(clicks) AS clicks,
      sum(visitors) AS visitors,
      sum(existing_visitors) AS existing_visitors,
      sum(new_visitors) AS new_visitors,
      sdk_key
    FROM klicklab.minutes_metrics
    WHERE date_time >= toDateTime('${start.format('YYYY-MM-DD HH:mm:ss')}')
      AND date_time < toDateTime('${end.format('YYYY-MM-DD HH:mm:ss')}')
    GROUP BY
      date_time, sdk_key
    ORDER BY
      date_time, sdk_key;
  `;

  try {
    await clickhouse.command({ query });
    console.log(`[✓] 집계 완료: ${start.format()} ~ ${end.format()}`);
  } catch (error) {
    console.error("[!] 집계 오류:", error.message);
  }
}

runHourlyAggregation();

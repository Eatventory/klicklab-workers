require('dotenv').config();
/* minutes_page_stats → hourly_page_stats */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

async function runHourlyPageAggregation() {
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
    end = dayjs().startOf('hour');
    start = end.subtract(1, 'hour');
  }

  const query = `
    INSERT INTO klicklab.hourly_page_stats
    WITH
      sum(page_views) AS total_views,
      sum(page_exits) AS total_exits,
      avg(avg_time_on_page_seconds) AS avg_time
    SELECT
      date_time,
      page_path,
      total_views AS page_views,
      total_exits AS page_exits,
      if(total_views = 0, 0, round(total_exits / total_views, 3)) AS drop_rate,
      any(next_pages.to) AS "next_pages.to",
      any(next_pages.count) AS "next_pages.count",
      sdk_key,
      round(avg_time, 2) AS avg_time_on_page_seconds
    FROM (
      SELECT
        toStartOfHour(date_time) AS date_time,
        page_path,
        page_views,
        page_exits,
        next_pages.to,
        next_pages.count,
        sdk_key,
        avg_time_on_page_seconds
      FROM klicklab.minutes_page_stats
      WHERE date_time >= toDateTime('${start.format('YYYY-MM-DD HH:mm:ss')}')
        AND date_time < toDateTime('${end.format('YYYY-MM-DD HH:mm:ss')}')
    )
    GROUP BY
      date_time, page_path, sdk_key
    ORDER BY
      date_time, page_path, sdk_key;
  `;

  try {
    await clickhouse.command({ query });
    console.log(`✅ hourly_page_stats 집계 완료: ${start.format()} ~ ${end.format()}`);
  } catch (error) {
    console.error("❌ 집계 오류:", error.message);
  }
}

runHourlyPageAggregation();

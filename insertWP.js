/* daily_page_stats → weekly_page_stats */
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
  end = dayjs().startOf("day");
  start = end.subtract(7, "day");
}

const query = `
  INSERT INTO klicklab.weekly_page_stats
  WITH
    sum(page_views) AS total_views,
    sum(page_exits) AS total_exits,
    avg(avg_time_on_page_seconds) AS avg_time
  SELECT
    toDate('${start.format("YYYY-MM-DD")}') AS date,
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
      page_path,
      page_views,
      page_exits,
      next_pages.to,
      next_pages.count,
      sdk_key,
      avg_time_on_page_seconds
    FROM klicklab.daily_page_stats
    WHERE date >= toDate('${start.format("YYYY-MM-DD")}')
      AND date < toDate('${end.format("YYYY-MM-DD")}')
  )
  GROUP BY page_path, sdk_key
  ORDER BY page_path, sdk_key;
`;

async function run() {
  try {
    await clickhouse.command({ query });
    console.log(
      `✅ [${start.format()} ~ ${end.subtract(1, "day").format()}] 주간 페이지 통계 집계 완료`
    );
  } catch (err) {
    console.error("❌ 집계 실패:", err.message);
  }
}

run();

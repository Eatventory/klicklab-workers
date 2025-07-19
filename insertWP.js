require('dotenv').config();

// 한국 시간대 설정
process.env.TZ = 'Asia/Seoul';

/* daily_page_stats → weekly_page_stats */
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");

const input = process.argv[2];
let start, end;

if (input) {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
      if (isDate) {
      start = dayjs(input).startOf("isoWeek");  // 월요일부터 시작
      end = start.add(1, "week");
    } else {
      console.error("❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD");
      process.exit(1);
    }
  } else {
    end = dayjs().startOf("isoWeek");  // 월요일부터 시작
    start = end.subtract(1, "week");
  }

const query = `
  INSERT INTO klicklab.weekly_page_stats
  SELECT
    grouped_week AS week,
    page_path,
    page_views,
    page_exits,
    drop_rate,
    next_pages_to,
    next_pages_count,
    sdk_key,
    avg_time_on_page_seconds
  FROM (
    SELECT
      toStartOfWeek(date) AS grouped_week,
      page_path,
      sdk_key,
      sum(page_views) AS page_views,
      sum(page_exits) AS page_exits,
      avg(drop_rate) AS drop_rate,
      any(\`next_pages.to\`) AS next_pages_to,
      any(\`next_pages.count\`) AS next_pages_count,
      avg(avg_time_on_page_seconds) AS avg_time_on_page_seconds
    FROM klicklab.daily_page_stats
    WHERE date >= toDate('${start.format("YYYY-MM-DD")}')
      AND date < toDate('${end.format("YYYY-MM-DD")}')
    GROUP BY
      toStartOfWeek(date), page_path, sdk_key
  ) AS aggregated
  ORDER BY
    grouped_week, page_path, sdk_key;
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

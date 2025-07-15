require('dotenv').config();
/* hourly_* → daily_* */
const clickhouse = require('./config/clickhouse');
const SEGMENT_LIST = require('./config/segmentList');

async function run() {
  const inputDate = process.argv[2];
  let targetDate;

  if (inputDate) {
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(inputDate);
    if (!isValidDate || isNaN(new Date(inputDate).getTime())) {
      console.error("❌ 잘못된 날짜 형식입니다. 형식: YYYY-MM-DD");
      process.exit(1);
    }
    targetDate = inputDate;
  } else {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    targetDate = now.toISOString().slice(0, 10);
  }

  const start = `${targetDate} 00:00:00`;
  const end = `${targetDate} 23:59:59`;

  for (const { type, expr } of SEGMENT_LIST) {
    console.log(`\n[집계 시작] ${type} (${targetDate})`);
    await insertClickSummary(type, expr, start, end);
    await insertTopElements(type, expr, start, end);
    await insertAgeDist(type, expr, start, end);
    await insertDeviceDist(type, expr, start, end);
    console.log(`[집계 완료] ${type}`);
  }

  await clickhouse.close();
}

// 1. 클릭 요약 통계
async function insertClickSummary(type, expr, start, end) {
  const q = `
    INSERT INTO klicklab.daily_click_summary
    SELECT
      toDate(toTimeZone(timestamp, 'Asia/Seoul')) AS date,
      '${type}' AS segment_type,
      ${expr} AS segment_value,
      count(*) AS total_clicks,
      count(DISTINCT client_id) AS total_users,
      round(count() / nullIf(countDistinct(client_id), 0), 1) AS avg_clicks_per_user,
      sdk_key
    FROM klicklab.events
    WHERE event_name = 'auto_click'
      AND timestamp BETWEEN toDateTime('${start}', 'Asia/Seoul') AND toDateTime('${end}', 'Asia/Seoul')
      AND ${expr} IS NOT NULL
    GROUP BY date, segment_value, sdk_key
  `;
  await clickhouse.command({ query: q });
}

// 2. Top 클릭 요소
async function insertTopElements(type, expr, start, end) {
  const q = `
    INSERT INTO klicklab.daily_top_elements
    SELECT *
    FROM (
      SELECT
        date,
        '${type}' AS segment_type,
        segment_value,
        element,
        total_clicks,
        user_count,
        row_number() OVER (PARTITION BY sdk_key, segment_value ORDER BY total_clicks DESC) AS rank,
        sdk_key
      FROM (
        SELECT
          toDate(toTimeZone(timestamp, 'Asia/Seoul')) AS date,
          ${expr} AS segment_value,
          target_text AS element,
          count(*) AS total_clicks,
          count(DISTINCT client_id) AS user_count,
          sdk_key
        FROM klicklab.events
        WHERE event_name = 'auto_click'
          AND timestamp BETWEEN toDateTime('${start}', 'Asia/Seoul') AND toDateTime('${end}', 'Asia/Seoul')
          AND length(target_text) > 0
          AND ${expr} IS NOT NULL
        GROUP BY date, segment_value, element, sdk_key
      )
    )
    WHERE rank <= 3
  `;
  await clickhouse.command({ query: q });
}

// 3. 연령대 분포
async function insertAgeDist(type, expr, start, end) {
  const q = `
    INSERT INTO klicklab.daily_user_distribution
    SELECT
      toDate(toTimeZone(timestamp, 'Asia/Seoul')) AS date,
      '${type}' AS segment_type,
      ${expr} AS segment_value,
      'ageGroup' AS dist_type,
      CASE
        WHEN user_age BETWEEN 10 AND 19 THEN '10s'
        WHEN user_age BETWEEN 20 AND 29 THEN '20s'
        WHEN user_age BETWEEN 30 AND 39 THEN '30s'
        WHEN user_age BETWEEN 40 AND 49 THEN '40s'
        WHEN user_age BETWEEN 50 AND 59 THEN '50s'
        WHEN user_age >= 60 THEN '60s+'
        ELSE 'unknown'
      END AS dist_value,
      count(DISTINCT client_id) AS user_count,
      sdk_key
    FROM klicklab.events
    WHERE event_name = 'auto_click'
      AND timestamp BETWEEN toDateTime('${start}', 'Asia/Seoul') AND toDateTime('${end}', 'Asia/Seoul')
      AND user_age IS NOT NULL
      AND ${expr} IS NOT NULL
    GROUP BY date, segment_value, dist_value, sdk_key
  `;
  await clickhouse.command({ query: q });
}

// 4. 디바이스 분포
async function insertDeviceDist(type, expr, start, end) {
  const q = `
    INSERT INTO klicklab.daily_user_distribution
    SELECT
      toDate(toTimeZone(timestamp, 'Asia/Seoul')) AS date,
      '${type}' AS segment_type,
      ${expr} AS segment_value,
      'device' AS dist_type,
      device_type AS dist_value,
      count(DISTINCT client_id) AS user_count,
      sdk_key
    FROM klicklab.events
    WHERE event_name = 'auto_click'
      AND timestamp BETWEEN toDateTime('${start}', 'Asia/Seoul') AND toDateTime('${end}', 'Asia/Seoul')
      AND length(device_type) > 0
      AND ${expr} IS NOT NULL
    GROUP BY date, segment_value, device_type, sdk_key
  `;
  await clickhouse.command({ query: q });
}

run().catch((err) => {
  console.error("❌ 집계 실패:", err);
  process.exit(1);
});

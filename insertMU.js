/* events → minutes_* */
const clickhouse = require("./config/clickhouse");
const SEGMENT_LIST = require('./config/segmentList');
const dayjs = require("dayjs");

async function run() {
  const input = process.argv[2];
  let start, end;

  if (input) {
    const isValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input);
    if (!isValid) {
      console.error("❌ 형식 오류: YYYY-MM-DDTHH:mm 형식이어야 합니다.");
      process.exit(1);
    }
    start = dayjs(input);
    end = start.add(10, "minute");
  } else {
    const now = dayjs();
    const aligned = now
      .subtract(now.minute() % 10, "minute")
      .startOf("minute");
    end = aligned;
    start = end.subtract(10, "minute");
  }

  const startStr = start.format("YYYY-MM-DD HH:mm:ss");
  const endStr = end.format("YYYY-MM-DD HH:mm:ss");

  for (const { type, expr } of SEGMENT_LIST) {
    console.log(`\n[10분 집계 시작] ${type}: ${startStr} ~ ${endStr}`);

    await insertClickSummary(type, expr, startStr, endStr);
    await insertTopElements(type, expr, startStr, endStr);
    await insertUserDistribution(type, expr, startStr, endStr);

    console.log(`[10분 집계 완료] ${type}`);
  }

  await clickhouse.close();
}

// 1. 클릭 요약 통계
async function insertClickSummary(type, expr, start, end) {
  const q = `
  INSERT INTO klicklab.minutes_click_summary
  SELECT
    toStartOfTenMinutes(timestamp) AS date_time,
    '${type}' AS segment_type,
    ${expr} AS segment_value,
    count(*) AS total_clicks,
    count(DISTINCT client_id) AS total_users,
    round(count() / countDistinct(client_id), 1) AS avg_clicks_per_user,
    sdk_key
  FROM klicklab.events
  WHERE event_name = 'auto_click'
    AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
    AND ${expr} IS NOT NULL
  GROUP BY date_time, segment_value, sdk_key
  `;
  await clickhouse.command({ query: q });
}

// 2. Top 클릭 요소 (Top 3)
async function insertTopElements(type, expr, start, end) {
  const q = `
  INSERT INTO klicklab.minutes_top_elements
  SELECT *
  FROM (
    SELECT
      toStartOfTenMinutes(timestamp) AS date_time,
      '${type}' AS segment_type,
      ${expr} AS segment_value,
      target_text AS element,
      count(*) AS total_clicks,
      count(DISTINCT client_id) AS user_count,
      row_number() OVER (PARTITION BY sdk_key, ${expr}, toStartOfTenMinutes(timestamp) ORDER BY count(*) DESC) AS rank,
      sdk_key
    FROM klicklab.events
    WHERE event_name = 'auto_click'
      AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND length(target_text) > 0
      AND ${expr} IS NOT NULL
    GROUP BY date_time, segment_value, target_text, sdk_key
  )
  WHERE rank <= 3
  `;
  await clickhouse.command({ query: q });
}

// 3. 사용자 분포 (연령대 + 디바이스)
async function insertUserDistribution(type, expr, start, end) {
  const base = `
  SELECT
    toStartOfTenMinutes(timestamp) AS date_time,
    '${type}' AS segment_type,
    ${expr} AS segment_value,
    '{DIST_TYPE}' AS dist_type,
    {DIST_EXPR} AS dist_value,
    count(DISTINCT client_id) AS user_count,
    sdk_key
  FROM klicklab.events
  WHERE event_name = 'auto_click'
    AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
    AND ${expr} IS NOT NULL
    AND {DIST_CONDITION}
  GROUP BY date_time, segment_value, dist_value, sdk_key
  `;

  const ageDistQuery = base
    .replace("{DIST_TYPE}", `'ageGroup'`)
    .replace(
      "{DIST_EXPR}",
      `
    CASE
      WHEN user_age BETWEEN 10 AND 19 THEN '10s'
      WHEN user_age BETWEEN 20 AND 29 THEN '20s'
      WHEN user_age BETWEEN 30 AND 39 THEN '30s'
      WHEN user_age BETWEEN 40 AND 49 THEN '40s'
      WHEN user_age BETWEEN 50 AND 59 THEN '50s'
      WHEN user_age >= 60 THEN '60s+'
      ELSE 'unknown'
    END
  `
    )
    .replace("{DIST_CONDITION}", "user_age IS NOT NULL");

  const deviceDistQuery = base
    .replace("{DIST_TYPE}", `'device'`)
    .replace("{DIST_EXPR}", "device_type")
    .replace("{DIST_CONDITION}", "length(device_type) > 0");

  await clickhouse.command({ query: ageDistQuery });
  await clickhouse.command({ query: deviceDistQuery });
}

// 실행
run().catch((err) => {
  console.error("❌ 집계 실패:", err);
  process.exit(1);
});

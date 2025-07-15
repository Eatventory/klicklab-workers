require('dotenv').config();
/* minutes_* → hourly_* */
const clickhouse = require("./config/clickhouse");
const SEGMENT_LIST = require("./config/segmentList");
const dayjs = require("dayjs");

async function run() {
  const input = process.argv[2];
  let start, end;

  if (input) {
    const isValid = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(input);
    if (!isValid) {
      console.error("❌ 형식 오류: YYYY-MM-DDTHH 형식이어야 합니다.");
      process.exit(1);
    }
    start = dayjs(input);
    end = start.add(1, "hour");
  } else {
    end = dayjs().startOf("hour");
    start = end.subtract(1, "hour");
  }

  const startStr = start.format("YYYY-MM-DD HH:mm:ss");
  const endStr = end.format("YYYY-MM-DD HH:mm:ss");

  for (const { type } of SEGMENT_LIST) {
    console.log(`\n[1시간 집계 시작] ${type}: ${startStr} ~ ${endStr}`);

    await insertClickSummary(type, startStr, endStr);
    await insertTopElements(type, startStr, endStr);
    await insertUserDistribution(type, startStr, endStr);

    console.log(`[1시간 집계 완료] ${type}`);
  }

  await clickhouse.close();
}

// 1. 클릭 요약 통계
async function insertClickSummary(type, start, end) {
  const q = `
    INSERT INTO klicklab.hourly_click_summary
    SELECT
      date_time,
      '${type}' AS segment_type,
      segment_value,
      total_clicks,
      total_users,
      round(total_clicks / nullIf(total_users, 0), 1) AS avg_clicks_per_user,
      sdk_key
    FROM (
      SELECT
        toStartOfHour(date_time) AS date_time,
        segment_value,
        sum(total_clicks) AS total_clicks,
        sum(total_users) AS total_users,
        sdk_key
      FROM klicklab.minutes_click_summary
      WHERE segment_type = '${type}'
        AND date_time >= toDateTime('${start}')
        AND date_time < toDateTime('${end}')
      GROUP BY date_time, segment_value, sdk_key
    )
  `;
  await clickhouse.command({ query: q });
}

// 2. Top 클릭 요소 (Top 3)
async function insertTopElements(type, start, end) {
  const q = `
    INSERT INTO klicklab.hourly_top_elements
    SELECT
      date_time,
      '${type}' AS segment_type,
      segment_value,
      element,
      total_clicks,
      user_count,
      rank,
      sdk_key
    FROM (
      SELECT
        *,
        row_number() OVER (
          PARTITION BY sdk_key, segment_value, date_time
          ORDER BY total_clicks DESC
        ) AS rank
      FROM (
        SELECT
          toStartOfHour(date_time) AS date_time,
          segment_value,
          element,
          sum(total_clicks) AS total_clicks,
          sum(user_count) AS user_count,
          sdk_key
        FROM klicklab.minutes_top_elements
        WHERE segment_type = '${type}'
          AND date_time >= toDateTime('${start}')
          AND date_time < toDateTime('${end}')
        GROUP BY date_time, segment_value, element, sdk_key
      )
    ) AS ranked
    WHERE rank <= 3
  `;
  await clickhouse.command({ query: q });
}

// 3. 사용자 분포
async function insertUserDistribution(type, start, end) {
  const q = `
    INSERT INTO klicklab.hourly_user_distribution
    SELECT
      hour_time AS date_time,
      '${type}' AS segment_type,
      segment_value,
      dist_type,
      dist_value,
      sum(user_count) AS user_count,
      sdk_key
    FROM (
      SELECT
        toStartOfHour(date_time) AS hour_time,
        segment_value,
        dist_type,
        dist_value,
        user_count,
        sdk_key
      FROM klicklab.minutes_user_distribution
      WHERE segment_type = '${type}'
        AND date_time >= toDateTime('${start}')
        AND date_time < toDateTime('${end}')
    )
    GROUP BY hour_time, segment_value, dist_type, dist_value, sdk_key
  `;
  await clickhouse.command({ query: q });
}

// 실행
run().catch((err) => {
  console.error("❌ 집계 실패:", err.message);
  process.exit(1);
});

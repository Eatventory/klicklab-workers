require('dotenv').config();
/* events → minutes_* */
const clickhouse = require("./config/clickhouse");
const SEGMENT_LIST = require('./config/segmentList');
const dayjs = require("dayjs");

function run() {
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
    const aligned = now.subtract(now.minute() % 10, "minute").startOf("minute");
    end = aligned;
    start = end.subtract(10, "minute");
  }

  const startStr = start.format("YYYY-MM-DD HH:mm:ss");
  const endStr = end.format("YYYY-MM-DD HH:mm:ss");

  let completedSegments = 0;
  const totalSegments = SEGMENT_LIST.length;

  for (const { type, expr } of SEGMENT_LIST) {
    console.log(`\n[10분 집계 시작] ${type}: ${startStr} ~ ${endStr}`);

    processSegment(type, expr, startStr, endStr, () => {
      completedSegments++;
      console.log(`[10분 집계 완료] ${type}`);
      
      if (completedSegments === totalSegments) {
        console.log("✅ 모든 세그먼트 집계 완료");
      }
    });
  }
}

// 세그먼트별 처리
function processSegment(type, expr, start, end, callback) {
  let completed = 0;
  const total = 3; // insertClickSummary, insertTopElements, insertUserDistribution

  insertClickSummary(type, expr, start, end, () => {
    completed++;
    if (completed === total) callback();
  });

  insertTopElements(type, expr, start, end, () => {
    completed++;
    if (completed === total) callback();
  });

  insertUserDistribution(type, expr, start, end, () => {
    completed++;
    if (completed === total) callback();
  });
}

// 1. 클릭 요약 통계
function insertClickSummary(type, expr, start, end, callback) {
  const q = `
    INSERT INTO klicklab.minutes_click_summary
    SELECT
      toStartOfTenMinutes(timestamp) AS date_time,
      '${type}' AS segment_type,
      ${expr} AS segment_value,
      count(*) AS total_clicks,
      count(DISTINCT client_id) AS total_users,
      round(count() / nullIf(countDistinct(client_id), 0), 1) AS avg_clicks_per_user,
      sdk_key
    FROM klicklab.events
    WHERE event_name = 'auto_click'
      AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND ${expr} IS NOT NULL
    GROUP BY date_time, segment_value, sdk_key
  `;
  clickhouse.query(q, (err, result) => {
    if (err) {
      console.error(`❌ insertClickSummary 실패 (${type}):`, err.message);
    }
    callback();
  });
}

// 2. Top 클릭 요소 (Top 3)
function insertTopElements(type, expr, start, end, callback) {
  const q = `
    INSERT INTO klicklab.minutes_top_elements
    SELECT *
    FROM (
      SELECT
        date_time,
        '${type}' AS segment_type,
        segment_value,
        element,
        total_clicks,
        user_count,
        row_number() OVER (
          PARTITION BY sdk_key, segment_value, date_time
          ORDER BY total_clicks DESC
        ) AS rank,
        sdk_key
      FROM (
        SELECT
          toStartOfTenMinutes(timestamp) AS date_time,
          '${type}' AS segment_type,
          ${expr} AS segment_value,
          target_text AS element,
          count(*) AS total_clicks,
          count(DISTINCT client_id) AS user_count,
          sdk_key
        FROM klicklab.events
        WHERE event_name = 'auto_click'
          AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
          AND length(target_text) > 0
          AND ${expr} IS NOT NULL
        GROUP BY date_time, segment_value, element, sdk_key
      )
    )
    WHERE rank <= 3
  `;
  clickhouse.query(q, (err, result) => {
    if (err) {
      console.error(`❌ insertTopElements 실패 (${type}):`, err.message);
    }
    callback();
  });
}

// 3. 사용자 분포
function insertUserDistribution(type, expr, start, end, callback) {
  let completed = 0;
  const total = 2; // ageDistQuery, deviceDistQuery

  const ageDistQuery = `
    INSERT INTO klicklab.minutes_user_distribution
    SELECT
      toStartOfTenMinutes(timestamp) AS date_time,
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
      AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND ${expr} IS NOT NULL AND user_age IS NOT NULL
    GROUP BY date_time, segment_value, dist_value, sdk_key
  `;

  const deviceDistQuery = `
    INSERT INTO klicklab.minutes_user_distribution
    SELECT
      toStartOfTenMinutes(timestamp) AS date_time,
      '${type}' AS segment_type,
      ${expr} AS segment_value,
      'device' AS dist_type,
      device_type AS dist_value,
      count(DISTINCT client_id) AS user_count,
      sdk_key
    FROM klicklab.events
    WHERE event_name = 'auto_click'
      AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND ${expr} IS NOT NULL AND length(device_type) > 0
    GROUP BY date_time, segment_value, device_type, sdk_key
  `;

  clickhouse.query(ageDistQuery, (err, result) => {
    if (err) {
      console.error(`❌ insertUserDistribution (age) 실패 (${type}):`, err.message);
    }
    completed++;
    if (completed === total) callback();
  });

  clickhouse.query(deviceDistQuery, (err, result) => {
    if (err) {
      console.error(`❌ insertUserDistribution (device) 실패 (${type}):`, err.message);
    }
    completed++;
    if (completed === total) callback();
  });
}

// 실행
run();

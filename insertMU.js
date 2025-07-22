require("dotenv").config();

// 한국 시간대 설정
process.env.TZ = "Asia/Seoul";

/* events → minutes_user_stats */
const clickhouse = require("./config/clickhouse");
const SEGMENT_LIST = require("./config/segmentList");
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
  let query = "";

  // 세그먼트 타입별로 다른 분포 로직 적용
  switch (type) {
    case "device_type":
      query = `
        INSERT INTO klicklab.minutes_user_distribution
        SELECT
          toStartOfTenMinutes(timestamp) AS date_time,
          '${type}' AS segment_type,
          ${expr} AS segment_value,
          'device_os' AS dist_type,
          CASE
            WHEN device_type = 'desktop' AND device_os = 'Windows' THEN 'Windows'
            WHEN device_type = 'desktop' AND device_os = 'macOS' THEN 'macOS'
            WHEN device_type = 'mobile' AND device_os = 'Android' THEN 'Android'
            WHEN device_type = 'mobile' AND device_os = 'iOS' THEN 'iOS'
            ELSE 'Other'
          END AS dist_value,
          count(DISTINCT client_id) AS user_count,
          sdk_key
        FROM klicklab.events
        WHERE event_name = 'auto_click'
          AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
          AND ${expr} IS NOT NULL AND length(device_os) > 0
        GROUP BY date_time, segment_value, dist_value, sdk_key
      `;
      break;

    case "user_age":
      query = `
        INSERT INTO klicklab.minutes_user_distribution
        SELECT
          toStartOfTenMinutes(timestamp) AS date_time,
          '${type}' AS segment_type,
          ${expr} AS segment_value,
          '' AS dist_type,
          '' AS dist_value,
          count(DISTINCT client_id) AS user_count,
          sdk_key
        FROM klicklab.events
        WHERE event_name = 'auto_click'
          AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
          AND ${expr} IS NOT NULL
        GROUP BY date_time, segment_value, sdk_key
      `;
      break;

    case "user_gender":
      query = `
        INSERT INTO klicklab.minutes_user_distribution
        SELECT
          toStartOfTenMinutes(timestamp) AS date_time,
          '${type}' AS segment_type,
          ${expr} AS segment_value,
          '' AS dist_type,
          '' AS dist_value,
          count(DISTINCT client_id) AS user_count,
          sdk_key
        FROM klicklab.events
        WHERE event_name = 'auto_click'
          AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
          AND ${expr} IS NOT NULL
        GROUP BY date_time, segment_value, sdk_key
      `;
      break;

    case "country":
      query = `
        INSERT INTO klicklab.minutes_user_distribution
        SELECT
          toStartOfTenMinutes(timestamp) AS date_time,
          '${type}' AS segment_type,
          ${expr} AS segment_value,
          'city' AS dist_type,
          city AS dist_value,
          count(DISTINCT client_id) AS user_count,
          sdk_key
        FROM klicklab.events
        WHERE event_name = 'auto_click'
          AND timestamp BETWEEN toDateTime('${start}') AND toDateTime('${end}')
          AND ${expr} IS NOT NULL AND length(city) > 0
        GROUP BY date_time, segment_value, dist_value, sdk_key
      `;
      break;

    case "traffic_source":
      query = `
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
        GROUP BY date_time, segment_value, dist_value, sdk_key
      `;
      break;

    default:
      console.log(`⚠️ 알 수 없는 세그먼트 타입: ${type}`);
      callback();
      return;
  }

  clickhouse.query(query, (err, result) => {
    if (err) {
      console.error(`❌ insertUserDistribution 실패 (${type}):`, err.message);
    }
    callback();
  });
}

// 실행
run();

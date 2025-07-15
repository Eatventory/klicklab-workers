require('dotenv').config();

// 한국 시간대 설정
process.env.TZ = 'Asia/Seoul';

/* minutes_* → hourly_* */
const clickhouse = require("./config/clickhouse");
const SEGMENT_LIST = require('./config/segmentList');
const dayjs = require("dayjs");

function run() {
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
    const now = dayjs();
    // 1시간 지연: 현재 01:00라면 23:00~00:00 구간을 집계
    end = now.startOf("hour").subtract(1, "hour");
    start = end.subtract(1, "hour");
  }

  const startStr = start.format("YYYY-MM-DD HH:mm:ss");
  const endStr = end.format("YYYY-MM-DD HH:mm:ss");

  let completedSegments = 0;
  const totalSegments = SEGMENT_LIST.length;

  for (const { type, expr } of SEGMENT_LIST) {
    console.log(`\n[1시간 집계 시작] ${type}: ${startStr} ~ ${endStr}`);

    processSegment(type, expr, startStr, endStr, () => {
      completedSegments++;
      console.log(`[1시간 집계 완료] ${type}`);
      
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
    INSERT INTO klicklab.hourly_click_summary
    SELECT
      grouped_time AS date_time,
      '${type}' AS segment_type,
      segment_value,
      total_clicks,
      total_users,
      round(total_clicks / nullIf(total_users, 0), 1) AS avg_clicks_per_user,
      sdk_key
    FROM (
      SELECT
        toStartOfHour(date_time) AS grouped_time,
        segment_value,
        sdk_key,
        sum(total_clicks) AS total_clicks,
        sum(total_users) AS total_users
      FROM klicklab.minutes_click_summary
      WHERE date_time >= toDateTime('${start}') AND date_time <= toDateTime('${end}')
        AND segment_type = '${type}'
      GROUP BY toStartOfHour(date_time), segment_value, sdk_key
    ) AS aggregated
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
    INSERT INTO klicklab.hourly_top_elements
    SELECT *
    FROM (
      SELECT
        grouped_time AS date_time,
        '${type}' AS segment_type,
        segment_value,
        element,
        total_clicks,
        user_count,
        row_number() OVER (
          PARTITION BY sdk_key, segment_value, grouped_time
          ORDER BY total_clicks DESC
        ) AS rank,
        sdk_key
      FROM (
        SELECT
          toStartOfHour(date_time) AS grouped_time,
          segment_value,
          element,
          sdk_key,
          sum(total_clicks) AS total_clicks,
          sum(user_count) AS user_count
        FROM klicklab.minutes_top_elements
        WHERE date_time >= toDateTime('${start}') AND date_time <= toDateTime('${end}')
          AND segment_type = '${type}'
        GROUP BY toStartOfHour(date_time), segment_value, element, sdk_key
      ) AS aggregated
    ) AS ranked
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
    INSERT INTO klicklab.hourly_user_distribution
    SELECT
      grouped_time AS date_time,
      '${type}' AS segment_type,
      segment_value,
      dist_type,
      dist_value,
      user_count,
      sdk_key
    FROM (
      SELECT
        toStartOfHour(date_time) AS grouped_time,
        segment_value,
        dist_type,
        dist_value,
        sdk_key,
        sum(user_count) AS user_count
      FROM klicklab.minutes_user_distribution
      WHERE date_time >= toDateTime('${start}') AND date_time <= toDateTime('${end}')
        AND segment_type = '${type}' AND dist_type = 'ageGroup'
      GROUP BY toStartOfHour(date_time), segment_value, dist_type, dist_value, sdk_key
    ) AS aggregated
  `;

  const deviceDistQuery = `
    INSERT INTO klicklab.hourly_user_distribution
    SELECT
      grouped_time AS date_time,
      '${type}' AS segment_type,
      segment_value,
      dist_type,
      dist_value,
      user_count,
      sdk_key
    FROM (
      SELECT
        toStartOfHour(date_time) AS grouped_time,
        segment_value,
        dist_type,
        dist_value,
        sdk_key,
        sum(user_count) AS user_count
      FROM klicklab.minutes_user_distribution
      WHERE date_time >= toDateTime('${start}') AND date_time <= toDateTime('${end}')
        AND segment_type = '${type}' AND dist_type = 'device'
      GROUP BY toStartOfHour(date_time), segment_value, dist_type, dist_value, sdk_key
    ) AS aggregated
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

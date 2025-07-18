require('dotenv').config();

// 한국 시간대 설정
process.env.TZ = 'Asia/Seoul';

/* daily_* → weekly_* */
const clickhouse = require("./config/clickhouse");
const SEGMENT_LIST = require('./config/segmentList');
const dayjs = require("dayjs");

function run() {
  const input = process.argv[2];
  let start, end;

  if (input) {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
    if (isDate) {
      start = dayjs(input).startOf("week");
      end = start.add(1, "week");
    } else {
      console.error("❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD");
      process.exit(1);
    }
  } else {
    end = dayjs().startOf("week");
    start = end.subtract(1, "week");
  }

  const startStr = start.format("YYYY-MM-DD HH:mm:ss");
  const endStr = end.format("YYYY-MM-DD HH:mm:ss");

  let completedSegments = 0;
  const totalSegments = SEGMENT_LIST.length;

  for (const { type, expr } of SEGMENT_LIST) {
    console.log(`\n[주간 집계 시작] ${type}: ${startStr} ~ ${endStr}`);

    processSegment(type, expr, startStr, endStr, () => {
      completedSegments++;
      console.log(`[주간 집계 완료] ${type}`);
      
      if (completedSegments === totalSegments) {
        console.log("✅ 모든 세그먼트 집계 완료");
      }
    });
  }
}

function processSegment(type, expr, start, end, callback) {
  let completed = 0;
  const total = 3;

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

function insertClickSummary(type, expr, start, end, callback) {
  const q = `
    INSERT INTO klicklab.weekly_click_summary
    SELECT
      grouped_week AS week,
      '${type}' AS segment_type,
      segment_value,
      total_clicks,
      total_users,
      round(total_clicks / nullIf(total_users, 0), 1) AS avg_clicks_per_user,
      sdk_key
    FROM (
      SELECT
        toStartOfWeek(date) AS grouped_week,
        segment_value,
        sdk_key,
        sum(total_clicks) AS total_clicks,
        sum(total_users) AS total_users
      FROM klicklab.daily_click_summary
      WHERE date >= toDate('${start}') AND date <= toDate('${end}')
        AND segment_type = '${type}'
      GROUP BY toStartOfWeek(date), segment_value, sdk_key
    ) AS aggregated
  `;
  clickhouse.query(q, (err, result) => {
    if (err) {
      console.error(`❌ insertClickSummary 실패 (${type}):`, err.message);
    }
    callback();
  });
}

function insertTopElements(type, expr, start, end, callback) {
  const q = `
    INSERT INTO klicklab.weekly_top_elements
    SELECT *
    FROM (
      SELECT
        grouped_week AS week,
        '${type}' AS segment_type,
        segment_value,
        element,
        total_clicks,
        user_count,
        row_number() OVER (
          PARTITION BY sdk_key, segment_value, grouped_week
          ORDER BY total_clicks DESC
        ) AS rank,
        sdk_key
      FROM (
        SELECT
          toStartOfWeek(date) AS grouped_week,
          segment_value,
          element,
          sdk_key,
          sum(total_clicks) AS total_clicks,
          sum(user_count) AS user_count
        FROM klicklab.daily_top_elements
        WHERE date >= toDate('${start}') AND date <= toDate('${end}')
          AND segment_type = '${type}'
        GROUP BY toStartOfWeek(date), segment_value, element, sdk_key
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

function insertUserDistribution(type, expr, start, end, callback) {
  let query = '';

  // 세그먼트 타입별로 다른 분포 로직 적용
  switch (type) {
    case 'device_type':
      query = `
        INSERT INTO klicklab.weekly_user_distribution
        SELECT
          grouped_week AS week,
          '${type}' AS segment_type,
          segment_value,
          dist_type,
          dist_value,
          user_count,
          sdk_key
        FROM (
          SELECT
            toStartOfWeek(date) AS grouped_week,
            segment_value,
            dist_type,
            dist_value,
            sdk_key,
            sum(user_count) AS user_count
          FROM klicklab.daily_user_distribution
          WHERE date >= toDate('${start}') AND date <= toDate('${end}')
            AND segment_type = '${type}' AND dist_type = 'device_os'
          GROUP BY toStartOfWeek(date), segment_value, dist_type, dist_value, sdk_key
        ) AS aggregated
      `;
      break;

    case 'user_age':
    case 'user_gender':
      query = `
        INSERT INTO klicklab.weekly_user_distribution
        SELECT
          grouped_week AS week,
          '${type}' AS segment_type,
          segment_value,
          dist_type,
          dist_value,
          user_count,
          sdk_key
        FROM (
          SELECT
            toStartOfWeek(date) AS grouped_week,
            segment_value,
            dist_type,
            dist_value,
            sdk_key,
            sum(user_count) AS user_count
          FROM klicklab.daily_user_distribution
          WHERE date >= toDate('${start}') AND date <= toDate('${end}')
            AND segment_type = '${type}' AND dist_type = ''
          GROUP BY toStartOfWeek(date), segment_value, dist_type, dist_value, sdk_key
        ) AS aggregated
      `;
      break;

    case 'country':
      query = `
        INSERT INTO klicklab.weekly_user_distribution
        SELECT
          grouped_week AS week,
          '${type}' AS segment_type,
          segment_value,
          dist_type,
          dist_value,
          user_count,
          sdk_key
        FROM (
          SELECT
            toStartOfWeek(date) AS grouped_week,
            segment_value,
            dist_type,
            dist_value,
            sdk_key,
            sum(user_count) AS user_count
          FROM klicklab.daily_user_distribution
          WHERE date >= toDate('${start}') AND date <= toDate('${end}')
            AND segment_type = '${type}' AND dist_type = 'city'
          GROUP BY toStartOfWeek(date), segment_value, dist_type, dist_value, sdk_key
        ) AS aggregated
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

run();

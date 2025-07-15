require('dotenv').config();
/* hourly_* → daily_* */
const clickhouse = require('./config/clickhouse');
const SEGMENT_LIST = require('./config/segmentList');
const dayjs = require("dayjs");

function run() {
  const input = process.argv[2];
  let start, end;

  if (input) {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
    if (isDate) {
      start = dayjs(input).startOf("day");
      end = start.add(1, "day");
    } else {
      console.error("❌ 날짜 형식이 잘못됨. 예: YYYY-MM-DD");
      process.exit(1);
    }
  } else {
    end = dayjs().startOf("day");
    start = end.subtract(1, "day");
  }

  const startStr = start.format("YYYY-MM-DD HH:mm:ss");
  const endStr = end.format("YYYY-MM-DD HH:mm:ss");

  let completedSegments = 0;
  const totalSegments = SEGMENT_LIST.length;

  for (const { type, expr } of SEGMENT_LIST) {
    console.log(`\n[일간 집계 시작] ${type}: ${startStr} ~ ${endStr}`);

    processSegment(type, expr, startStr, endStr, () => {
      completedSegments++;
      console.log(`[일간 집계 완료] ${type}`);
      
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
    INSERT INTO klicklab.daily_click_summary
    SELECT
      toDate(date_time) AS date,
      '${type}' AS segment_type,
      segment_value,
      sum(total_clicks) AS total_clicks,
      count(DISTINCT total_users) AS total_users,
      round(sum(total_clicks) / nullIf(countDistinct(total_users), 0), 1) AS avg_clicks_per_user,
      sdk_key
    FROM klicklab.hourly_click_summary
    WHERE date_time BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND segment_type = '${type}'
    GROUP BY date, segment_value, sdk_key
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
    INSERT INTO klicklab.daily_top_elements
    SELECT *
    FROM (
      SELECT
        date,
        '${type}' AS segment_type,
        segment_value,
        element,
        sum(total_clicks) AS total_clicks,
        count(DISTINCT user_count) AS user_count,
        row_number() OVER (
          PARTITION BY sdk_key, segment_value, date
          ORDER BY sum(total_clicks) DESC
        ) AS rank,
        sdk_key
      FROM klicklab.hourly_top_elements
      WHERE date_time BETWEEN toDateTime('${start}') AND toDateTime('${end}')
        AND segment_type = '${type}'
      GROUP BY date, segment_value, element, sdk_key
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

function insertUserDistribution(type, expr, start, end, callback) {
  let completed = 0;
  const total = 2;

  const ageDistQuery = `
    INSERT INTO klicklab.daily_user_distribution
    SELECT
      toDate(date_time) AS date,
      '${type}' AS segment_type,
      segment_value,
      dist_type,
      dist_value,
      sum(user_count) AS user_count,
      sdk_key
    FROM klicklab.hourly_user_distribution
    WHERE date_time BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND segment_type = '${type}' AND dist_type = 'ageGroup'
    GROUP BY date, segment_value, dist_type, dist_value, sdk_key
  `;

  const deviceDistQuery = `
    INSERT INTO klicklab.daily_user_distribution
    SELECT
      toDate(date_time) AS date,
      '${type}' AS segment_type,
      segment_value,
      dist_type,
      dist_value,
      sum(user_count) AS user_count,
      sdk_key
    FROM klicklab.hourly_user_distribution
    WHERE date_time BETWEEN toDateTime('${start}') AND toDateTime('${end}')
      AND segment_type = '${type}' AND dist_type = 'device'
    GROUP BY date, segment_value, dist_type, dist_value, sdk_key
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

run();

// 성능 최적화된 Worker
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");
const cron = require("node-cron");

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// 최적화된 집계 쿼리
async function runOptimizedAggregation(period, start, end) {
  const queries = {
    '10min': {
      // 파티션 프루닝 최적화
      query: `
        INSERT INTO klicklab.minutes_metrics
        SELECT
          toStartOfTenMinutes(e.timestamp) AS date_time,
          countIf(e.event_name = 'auto_click') AS clicks,
          count(DISTINCT e.client_id) AS visitors,
          count(DISTINCT if(past.client_id IS NULL, e.client_id, NULL)) AS new_visitors,
          count(DISTINCT if(past.client_id IS NOT NULL, e.client_id, NULL)) AS existing_visitors,
          toUInt32(avgIf(e.session_duration, e.session_duration > 0)) AS avg_session_seconds,
          e.sdk_key
        FROM (
          SELECT client_id, timestamp, sdk_key, event_name,
                 dateDiff('second', 
                         min(timestamp) OVER (PARTITION BY client_id, sdk_key),
                         max(timestamp) OVER (PARTITION BY client_id, sdk_key)
                 ) AS session_duration
          FROM klicklab.events
          WHERE timestamp >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
            AND timestamp < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
        ) AS e
        LEFT JOIN (
          SELECT DISTINCT client_id, sdk_key
          FROM klicklab.events
          WHERE timestamp < toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
        ) AS past ON e.client_id = past.client_id AND e.sdk_key = past.sdk_key
        GROUP BY date_time, e.sdk_key
        ORDER BY date_time, e.sdk_key
        SETTINGS 
          max_memory_usage = 2GB,
          max_bytes_before_external_group_by = 1GB,
          max_threads = 4
      `
    },
    'hour': {
      // 단순 합산 (매우 빠름)
      query: `
        INSERT INTO klicklab.hourly_metrics
        SELECT
          toStartOfHour(date_time) AS date_time,
          sum(clicks) AS clicks,
          sum(visitors) AS visitors,
          sum(existing_visitors) AS existing_visitors,
          sum(new_visitors) AS new_visitors,
          toUInt32(avg(avg_session_seconds)) AS avg_session_seconds,
          sdk_key
        FROM klicklab.minutes_metrics
        WHERE date_time >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
          AND date_time < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
        GROUP BY date_time, sdk_key
        ORDER BY date_time, sdk_key
        SETTINGS max_threads = 2
      `
    },
    'day': {
      // 매우 단순한 합산
      query: `
        INSERT INTO klicklab.daily_metrics
        SELECT
          toDate(date_time) AS date,
          sum(clicks) AS clicks,
          sum(visitors) AS visitors,
          sum(existing_visitors) AS existing_visitors,
          sum(new_visitors) AS new_visitors,
          toUInt32(avg(avg_session_seconds)) AS avg_session_seconds,
          sdk_key
        FROM klicklab.hourly_metrics
        WHERE date_time >= toDateTime('${start.format("YYYY-MM-DD")} 00:00:00')
          AND date_time < toDateTime('${end.format("YYYY-MM-DD")} 00:00:00')
        GROUP BY date, sdk_key
        ORDER BY date, sdk_key
        SETTINGS max_threads = 1
      `
    }
  };

  try {
    const queryConfig = queries[period];
    if (!queryConfig) {
      throw new Error(`Unknown period: ${period}`);
    }

    log(`🚀 ${period} 최적화 집계 시작: ${start.format()} ~ ${end.format()}`);
    const startTime = Date.now();
    
    await clickhouse.command({ query: queryConfig.query });
    
    const duration = Date.now() - startTime;
    log(`✅ ${period} 집계 완료 (${duration}ms)`);
    
  } catch (err) {
    log(`❌ ${period} 집계 실패: ${err.message}`);
  }
}

// 우선순위 기반 스케줄링
cron.schedule("* * * * *", () => {
  const now = new Date();
  const min = now.getMinutes();
  const hour = now.getHours();

  // 10분 집계 (최우선)
  if (min % 10 === 0) {
    const end = dayjs().startOf("minute").subtract(dayjs().minute() % 10, "minute");
    const start = end.subtract(10, "minute");
    runOptimizedAggregation('10min', start, end);
  }

  // 시간 집계 (낮은 우선순위)
  if (min === 0) {
    setTimeout(() => {
      const end = dayjs().startOf("hour");
      const start = end.subtract(1, "hour");
      runOptimizedAggregation('hour', start, end);
    }, 30000); // 30초 지연
  }

  // 일 집계 (가장 낮은 우선순위)
  if (hour === 0 && min === 10) {
    setTimeout(() => {
      const end = dayjs().startOf("day");
      const start = end.subtract(1, "day");
      runOptimizedAggregation('day', start, end);
    }, 60000); // 1분 지연
  }
});

log("⚡ 최적화된 Worker 시작됨"); 
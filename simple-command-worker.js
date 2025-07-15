// 단순 명령 전송 방식 Worker
const clickhouse = require('./config/clickhouse');
const dayjs = require("dayjs");
const cron = require("node-cron");

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// 단순한 집계 명령 전송
async function sendAggregationCommand(period, start, end) {
  const commands = {
    '10min': {
      query: `
        INSERT INTO klicklab.minutes_metrics
        SELECT
          toStartOfTenMinutes(timestamp) AS date_time,
          countIf(event_name = 'auto_click') AS clicks,
          count(DISTINCT client_id) AS visitors,
          count(DISTINCT if(past.client_id IS NULL, client_id, NULL)) AS new_visitors,
          count(DISTINCT if(past.client_id IS NOT NULL, client_id, NULL)) AS existing_visitors,
          toUInt32(avgIf(session_duration, session_duration > 0)) AS avg_session_seconds,
          sdk_key
        FROM (
          SELECT client_id, timestamp, sdk_key, event_name,
                 dateDiff('second', min(timestamp) OVER (PARTITION BY client_id, sdk_key),
                         max(timestamp) OVER (PARTITION BY client_id, sdk_key)) AS session_duration
          FROM klicklab.events
          WHERE timestamp >= toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
            AND timestamp < toDateTime('${end.format("YYYY-MM-DD HH:mm:ss")}')
        ) AS e
        LEFT JOIN (
          SELECT DISTINCT client_id, sdk_key
          FROM klicklab.events
          WHERE timestamp < toDateTime('${start.format("YYYY-MM-DD HH:mm:ss")}')
        ) AS past ON e.client_id = past.client_id AND e.sdk_key = past.sdk_key
        GROUP BY date_time, sdk_key
        ORDER BY date_time, sdk_key
      `
    },
    'hour': {
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
      `
    },
    'day': {
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
      `
    }
  };

  try {
    const command = commands[period];
    if (!command) {
      throw new Error(`Unknown period: ${period}`);
    }

    log(`📤 ${period} 집계 명령 전송: ${start.format()} ~ ${end.format()}`);
    await clickhouse.command({ query: command.query });
    log(`✅ ${period} 집계 완료`);
    
  } catch (err) {
    log(`❌ ${period} 집계 실패: ${err.message}`);
  }
}

// 스케줄러
cron.schedule("* * * * *", () => {
  const now = new Date();
  const min = now.getMinutes();
  const hour = now.getHours();
  const day = now.getDay();

  // 10분 집계
  if (min % 10 === 0) {
    const end = dayjs().startOf("minute").subtract(dayjs().minute() % 10, "minute");
    const start = end.subtract(10, "minute");
    sendAggregationCommand('10min', start, end);
  }

  // 시간 집계 (정각)
  if (min === 0) {
    const end = dayjs().startOf("hour");
    const start = end.subtract(1, "hour");
    sendAggregationCommand('hour', start, end);
  }

  // 일 집계 (매일 00:10)
  if (hour === 0 && min === 10) {
    const end = dayjs().startOf("day");
    const start = end.subtract(1, "day");
    sendAggregationCommand('day', start, end);
  }
});

log("📡 단순 명령 전송 Worker 시작됨"); 
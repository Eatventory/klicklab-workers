const clickhouse = require("./config/clickhouse");
const dayjs = require("dayjs");

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

  const query = `
    INSERT INTO klicklab.sankey_paths_daily
    SELECT
      toDate('${targetDate}') AS day,
      session_id,
      any(user_id) AS user_id,
      sdk_key,
      event_path,
      url_path,
      arrayLength(event_path) AS path_length
    FROM (
      SELECT
        session_id,
        any(user_id) AS user_id,
        sdk_key,
        groupArray(event_name ORDER BY timestamp) AS event_path,
        groupArray(page_path ORDER BY timestamp) AS url_path
      FROM klicklab.events
      WHERE timestamp BETWEEN toDateTime('${start}', 'Asia/Seoul') AND toDateTime('${end}', 'Asia/Seoul')
      GROUP BY sdk_key, session_id
    )
    GROUP BY day, session_id, user_id, sdk_key, event_path, url_path
    ORDER BY day, session_id
  `;

  try {
    await clickhouse.command({ query });
    console.log(`✅ sankey_paths_daily 집계 완료: ${targetDate}`);
  } catch (err) {
    console.error("❌ 집계 실패:", err.message);
    process.exit(1);
  }
}

run();

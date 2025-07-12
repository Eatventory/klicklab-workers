const path = require("path");
const { exec } = require("child_process");
const dayjs = require("dayjs");
const clickhouse = require("./config/clickhouse");
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");
dayjs.extend(isSameOrBefore);

const START_DATE = process.argv[2];

if (!START_DATE || !/^\d{4}-\d{2}-\d{2}$/.test(START_DATE)) {
  console.error("❌ 날짜 형식 오류. 형식: YYYY-MM-DD");
  process.exit(1);
}

const start = dayjs(START_DATE);
const yesterday = dayjs().subtract(1, "day").startOf("day");

if (start.isAfter(yesterday.endOf("day"))) {
  console.error("❌ 시작 날짜는 오늘 이후일 수 없습니다.");
  process.exit(1);
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

function runScript(script, arg) {
  return new Promise((resolve) => {
    const fullPath = path.resolve(__dirname, script);
    log(`▶ 실행: ${script} ${arg}`);
    exec(`node "${fullPath}" ${arg}`, (err, stdout, stderr) => {
      if (err) log(`❌ ${script} 실패: ${err.message}`);
      if (stderr) console.error(stderr);
      if (stdout) console.log(stdout);
      log(`✅ 완료: ${script} ${arg}`);
      resolve();
    });
  });
}

async function deleteForDate(table, condition) {
  const q = `ALTER TABLE ${table} DELETE WHERE ${condition}`;
  try {
    log(`🧹 DELETE: ${table} WHERE ${condition}`);
    await clickhouse.command({ query: q });
  } catch (err) {
    log(`❌ DELETE 실패 (${table}): ${err.message}`);
  }
}

(async () => {
  log(`📦 집계 시작: ${START_DATE} ~ ${yesterday.format("YYYY-MM-DD")}`);

  for (
    let d = start.clone();
    d.isSameOrBefore(yesterday, "day");
    d = d.add(1, "day")
  ) {
    const dayStr = d.format("YYYY-MM-DD");
    const hourStart = d.startOf("day");

    // ✅ 삭제 (날짜 단위)
    await Promise.all([
      deleteForDate(
        "klicklab.minutes_metrics",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.minutes_click_summary",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.minutes_top_elements",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.minutes_user_distribution",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.hourly_metrics",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.hourly_click_summary",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.hourly_top_elements",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.hourly_user_distribution",
        `toDate(date_time) = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.daily_metrics",
        `date = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.daily_click_summary",
        `date = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.daily_top_elements",
        `date = toDate('${dayStr}')`
      ),
      deleteForDate(
        "klicklab.daily_user_distribution",
        `date = toDate('${dayStr}')`
      ),
    ]);

    // ✅ 집계 실행
    for (let i = 0; i < 24 * 6; i++) {
      const timeStr = hourStart
        .add(i * 10, "minute")
        .format("YYYY-MM-DDTHH:mm");
      await runScript("insertMM.js", timeStr);
      await runScript("insertMU.js", timeStr);
    }

    for (let h = 0; h < 24; h++) {
      const hourStr = hourStart.add(h, "hour").format("YYYY-MM-DDTHH");
      await runScript("insertHM.js", hourStr);
      await runScript("insertHU.js", hourStr);
    }

    await runScript("insertDM.js", dayStr);
    await runScript("insertDU.js", dayStr);
  }

  // ✅ 주간 삭제 및 집계 (7일 단위)
  for (
    let w = start.clone();
    w.add(6, "day").isSameOrBefore(yesterday, "day");
    w = w.add(7, "day")
  ) {
    const weekStart = w.format("YYYY-MM-DD");
    await Promise.all([
      deleteForDate(
        "klicklab.weekly_metrics",
        `date = toDate('${weekStart}')`
      ),
      deleteForDate(
        "klicklab.weekly_click_summary",
        `date = toDate('${weekStart}')`
      ),
      deleteForDate(
        "klicklab.weekly_top_elements",
        `date = toDate('${weekStart}')`
      ),
      deleteForDate(
        "klicklab.weekly_user_distribution",
        `date = toDate('${weekStart}')`
      ),
    ]);

    await runScript("insertWM.js", weekStart);
    await runScript("insertWU.js", weekStart);
  }

  log("🎉 전체 집계 완료");
})();

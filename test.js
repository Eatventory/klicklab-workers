const path = require("path");
const { exec } = require("child_process");
const dayjs = require("dayjs");
const clickhouse = require("./config/clickhouse");
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");
dayjs.extend(isSameOrBefore);

const args = process.argv.slice(2);
let start, end;

if (args.length === 0) {
  start = end = dayjs().subtract(1, "day").startOf("day"); // 인자 없으면 어제 하루
} else if (args.length === 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    console.error("❌ 날짜 형식 오류. 형식: YYYY-MM-DD");
    process.exit(1);
  }
  start = end = dayjs(args[0]);
} else if (args.length === 2) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args[0]) || !/^\d{4}-\d{2}-\d{2}$/.test(args[1])) {
    console.error("❌ 날짜 형식 오류. 형식: YYYY-MM-DD YYYY-MM-DD");
    process.exit(1);
  }
  start = dayjs(args[0]);
  end = dayjs(args[1]);
} else {
  console.error("❌ 사용법: node test.js [시작일] [종료일]");
  process.exit(1);
}

const today = dayjs().startOf("day");
if (start.isAfter(today)) {
  console.error("❌ 시작 날짜는 오늘 이후일 수 없습니다.");
  process.exit(1);
}
if (end.isAfter(today)) {
  console.warn("⚠ 종료 날짜가 오늘 이후입니다. 오늘로 조정됩니다.");
  end = today;
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
  log(`📦 집계 시작: ${start.format("YYYY-MM-DD")} ~ ${end.format("YYYY-MM-DD")}`);
  console.time('Runtime');

  for (
    let d = start.clone();
    d.isSameOrBefore(end, "day");
    d = d.add(1, "day")
  ) {
    const dayStr = d.format("YYYY-MM-DD");
    const hourStart = d.startOf("day");

    await Promise.all([
      deleteForDate("klicklab.minutes_metrics", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.minutes_click_summary", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.minutes_top_elements", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.minutes_user_distribution", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.minutes_page_stats", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.hourly_metrics", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.hourly_click_summary", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.hourly_top_elements", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.hourly_user_distribution", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.hourly_page_stats", `toDate(date_time) = toDate('${dayStr}')`),
      deleteForDate("klicklab.daily_metrics", `date = toDate('${dayStr}')`),
      deleteForDate("klicklab.daily_click_summary", `date = toDate('${dayStr}')`),
      deleteForDate("klicklab.daily_top_elements", `date = toDate('${dayStr}')`),
      deleteForDate("klicklab.daily_user_distribution", `date = toDate('${dayStr}')`),
      deleteForDate("klicklab.daily_page_stats", `date = toDate('${dayStr}')`),
    ]);

    for (let i = 0; i < 24 * 6; i++) {
      const timeStr = hourStart.add(i * 10, "minute").format("YYYY-MM-DDTHH:mm");
      await runScript("insertMM.js", timeStr);
      await runScript("insertMU.js", timeStr);
      await runScript("insertMP.js", timeStr);
    }

    for (let h = 0; h < 24; h++) {
      const hourStr = hourStart.add(h, "hour").format("YYYY-MM-DDTHH");
      await runScript("insertHM.js", hourStr);
      await runScript("insertHU.js", hourStr);
      await runScript("insertHP.js", hourStr);
    }

    await runScript("insertDM.js", dayStr);
    await runScript("insertDU.js", dayStr);
    await runScript("insertDP.js", dayStr);
  }

  for (
    let w = start.clone();
    w.add(6, "day").isSameOrBefore(end, "day");
    w = w.add(7, "day")
  ) {
    const weekStart = w.format("YYYY-MM-DD");
    await Promise.all([
      deleteForDate("klicklab.weekly_metrics", `date = toDate('${weekStart}')`),
      deleteForDate("klicklab.weekly_click_summary", `date = toDate('${weekStart}')`),
      deleteForDate("klicklab.weekly_top_elements", `date = toDate('${weekStart}')`),
      deleteForDate("klicklab.weekly_user_distribution", `date = toDate('${weekStart}')`),
      deleteForDate("klicklab.weekly_page_stats", `date = toDate('${weekStart}')`),
    ]);
    await runScript("insertWM.js", weekStart);
    await runScript("insertWU.js", weekStart);
    await runScript("insertWP.js", weekStart);
  }

  log("🎉 전체 집계 완료");
  console.timeEnd('Runtime');
})();

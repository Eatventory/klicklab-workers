const path = require("path");
const { exec } = require("child_process");
const cron = require("node-cron");

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// 실행 유틸
function runScript(name) {
  const filePath = path.resolve(__dirname, name);
  log(`▶ ${name} 실행 시작`);
  exec(`node ${filePath}`, (err, stdout, stderr) => {
    if (err) {
      log(`❌ ${name} 실패: ${err.message}`);
      return;
    }
    if (stderr) console.error(stderr);
    if (stdout) console.log(stdout);
    log(`✅ ${name} 완료`);
  });
}

// 🕒 매 10분마다 실행 (분: 0,10,20,...)
cron.schedule("*/10 * * * *", () => {
  runScript("insertMM.js"); // minutes_metrics
  runScript("insertMU.js"); // minutes_user_*
});

// 🕐 매시간 0분마다
cron.schedule("0 * * * *", () => {
  runScript("insertHM.js"); // hourly_metrics
  runScript("insertHU.js"); // hourly_user_*
});

// 🌅 매일 00:10 (조금 여유를 두고)
cron.schedule("10 0 * * *", () => {
  runScript("insertDM.js"); // daily_metrics
  runScript("insertDU.js"); // daily_user_*
});

// 📆 매주 월요일 00:30
cron.schedule("30 0 * * 1", () => {
  runScript("insertWM.js"); // weekly_metrics
  runScript("insertWU.js"); // weekly_user_*
});

// 초기 실행 로그
log("📡 통합 스케줄러 index.js 시작됨");

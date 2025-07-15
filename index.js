require('dotenv').config();
const path = require("path");
const { exec } = require("child_process");
const cron = require("node-cron");
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

function runScriptSequentially(scripts) {
  const [first, ...rest] = scripts;
  if (!first) return;
  const filePath = path.resolve(__dirname, first);
  log(`▶ ${first} 실행 시작`);
  exec(`node "${filePath}"`, (err, stdout, stderr) => {
    if (err) {
      log(`❌ ${first} 실패: ${err.message}`);
    } else {
      if (stderr) console.error(stderr);
      if (stdout) console.log(stdout);
      log(`✅ ${first} 완료`);
      runScriptSequentially(rest); // 다음 스크립트 실행
    }
  });
}

// [00:00, 00:10, 00:30 등 매 분마다 체크]
cron.schedule("* * * * *", () => {
  const now = new Date();
  const min = now.getMinutes();
  const hour = now.getHours();
  const day = now.getDay(); // 0: 일, 1: 월 ...

  // [00,10,20,...] → MM + MU
  if (min % 10 === 0) {
    const scripts = ["insertMM.js", "insertMU.js", "insertMP.js"];
    // 정각이면 H_도 같이
    if (min === 0) scripts.push("insertHM.js", "insertHU.js", "insertHP.js");
    runScriptSequentially(scripts);
  }

  // D_: 매일 00:10
  if (hour === 0 && min === 10) {
    runScriptSequentially(["insertDM.js", "insertDU.js", "insertDP.js"]);
  }

  // W_: 매주 월요일 00:30
  if (day === 1 && hour === 0 && min === 30) {
    runScriptSequentially(["insertWM.js", "insertWU.js", "insertWP.js"]);
  }
});

log("📡 통합 스케줄러 index.js 시작됨");

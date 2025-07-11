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
      runScriptSequentially(rest);
    }
  });
}

// ⏱️ 매 분마다 검사
cron.schedule("* * * * *", () => {
  const now = new Date();
  const min = now.getMinutes();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...

  // MM, MU: 매 10분마다
  if (min % 10 === 0) {
    runScriptSequentially(["insertMM.js", "insertMU.js"]);
  }

  // HM, HU: 매시 정각
  if (min === 0) {
    runScriptSequentially(["insertHM.js", "insertHU.js"]);
  }

  // DM, DU: 매일 00:10
  if (hour === 0 && min === 10) {
    runScriptSequentially(["insertDM.js", "insertDU.js"]);
  }

  // WM, WU: 매주 월요일 00:30
  if (day === 1 && hour === 0 && min === 30) {
    runScriptSequentially(["insertWM.js", "insertWU.js"]);
  }
});

log("📡 통합 스케줄러 index.js 시작됨");

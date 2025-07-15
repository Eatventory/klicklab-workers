// Worker 성능 최적화 버전
const path = require("path");
const { exec } = require("child_process");
const cron = require("node-cron");
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// 동시 실행 제한
let isProcessing = false;
const maxConcurrentJobs = 2;

function runScriptSequentially(scripts) {
  if (isProcessing) {
    log("⚠️ 다른 작업이 실행 중입니다. 건너뜁니다.");
    return;
  }
  
  isProcessing = true;
  const [first, ...rest] = scripts;
  if (!first) {
    isProcessing = false;
    return;
  }
  
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
    if (rest.length === 0) {
      isProcessing = false;
    }
  });
}

// 성능 최적화된 스케줄링
cron.schedule("* * * * *", () => {
  const now = new Date();
  const min = now.getMinutes();
  const hour = now.getHours();
  const day = now.getDay();

  // 10분 집계 (우선순위 높음)
  if (min % 10 === 0) {
    const scripts = ["insertMM.js", "insertMU.js", "insertMP.js"];
    if (min === 0) {
      // 정각이면 시간 집계도 함께
      scripts.push("insertHM.js", "insertHU.js", "insertHP.js");
    }
    runScriptSequentially(scripts);
  }

  // 일 집계 (낮은 우선순위)
  if (hour === 0 && min === 10) {
    setTimeout(() => {
      runScriptSequentially(["insertDM.js", "insertDU.js", "insertDP.js"]);
    }, 30000); // 30초 지연
  }

  // 주 집계 (가장 낮은 우선순위)
  if (day === 1 && hour === 0 && min === 30) {
    setTimeout(() => {
      runScriptSequentially(["insertWM.js", "insertWU.js", "insertWP.js"]);
    }, 60000); // 1분 지연
  }
});

// 메모리 사용량 모니터링
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memUsageMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
  };
  
  if (memUsageMB.heapUsed > 1000) { // 1GB 초과시
    log(`⚠️ 높은 메모리 사용량: ${memUsageMB.heapUsed}MB`);
    global.gc && global.gc(); // 가비지 컬렉션 강제 실행
  }
}, 60000); // 1분마다 체크

log("📡 최적화된 통합 스케줄러 시작됨"); 
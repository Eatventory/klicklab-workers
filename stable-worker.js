// 안정적인 Worker - 실패 방지 버전
const path = require("path");
const { exec } = require("child_process");
const cron = require("node-cron");
const fs = require("fs");

const log = (msg) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
  
  // 로그 파일에 기록
  fs.appendFileSync('/var/log/worker.log', `[${timestamp}] ${msg}\n`);
};

// 작업 상태 추적
let currentJobs = new Set();
let failedJobs = new Map(); // 실패한 작업 재시도용

// 프로세스 종료 방지
process.on('SIGTERM', () => {
  log("⚠️ SIGTERM 수신. 현재 작업 완료 후 종료");
  process.exit(0);
});

process.on('SIGINT', () => {
  log("⚠️ SIGINT 수신. 현재 작업 완료 후 종료");
  process.exit(0);
});

// 예상치 못한 에러 처리
process.on('uncaughtException', (err) => {
  log(`❌ 예상치 못한 에러: ${err.message}`);
  log(`스택: ${err.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ 처리되지 않은 Promise 거부: ${reason}`);
});

function runScriptWithRetry(scriptName, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(__dirname, scriptName);
    
    if (!fs.existsSync(filePath)) {
      log(`❌ 스크립트 파일 없음: ${scriptName}`);
      reject(new Error(`Script not found: ${scriptName}`));
      return;
    }
    
    log(`▶ ${scriptName} 실행 시작`);
    
    const child = exec(`node "${filePath}"`, {
      timeout: 300000, // 5분 타임아웃
      maxBuffer: 1024 * 1024 // 1MB 버퍼
    }, (err, stdout, stderr) => {
      if (err) {
        log(`❌ ${scriptName} 실패: ${err.message}`);
        
        // 재시도 로직
        const retryCount = failedJobs.get(scriptName) || 0;
        if (retryCount < maxRetries) {
          log(`🔄 ${scriptName} 재시도 (${retryCount + 1}/${maxRetries})`);
          failedJobs.set(scriptName, retryCount + 1);
          
          setTimeout(() => {
            runScriptWithRetry(scriptName, maxRetries).then(resolve).catch(reject);
          }, 10000); // 10초 후 재시도
        } else {
          log(`💀 ${scriptName} 최대 재시도 횟수 초과`);
          reject(err);
        }
      } else {
        if (stderr) console.error(stderr);
        if (stdout) console.log(stdout);
        log(`✅ ${scriptName} 완료`);
        failedJobs.delete(scriptName); // 성공시 실패 기록 삭제
        resolve();
      }
    });
    
    // 타임아웃 처리
    child.on('error', (err) => {
      log(`❌ ${scriptName} 프로세스 에러: ${err.message}`);
      reject(err);
    });
  });
}

async function runScriptSequentially(scripts) {
  if (currentJobs.size > 0) {
    log("⚠️ 다른 작업이 실행 중입니다. 건너뜁니다.");
    return;
  }
  
  for (const script of scripts) {
    currentJobs.add(script);
    try {
      await runScriptWithRetry(script);
    } catch (err) {
      log(`💀 ${script} 최종 실패: ${err.message}`);
      // 실패해도 다음 스크립트는 계속 실행
    } finally {
      currentJobs.delete(script);
    }
  }
}

// 메모리 모니터링 및 자동 정리
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memUsageMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
  };
  
  log(`📊 메모리 사용량: ${memUsageMB.heapUsed}MB / ${memUsageMB.heapTotal}MB`);
  
  // 메모리 사용량이 높으면 가비지 컬렉션 강제 실행
  if (memUsageMB.heapUsed > 800) { // 800MB 초과시
    log("🧹 메모리 정리 실행");
    global.gc && global.gc();
  }
}, 300000); // 5분마다 체크

// 안정적인 스케줄링
cron.schedule("* * * * *", () => {
  const now = new Date();
  const min = now.getMinutes();
  const hour = now.getHours();
  const day = now.getDay();

  // 10분 집계 (가장 중요)
  if (min % 10 === 0) {
    const scripts = ["insertMM.js", "insertMU.js", "insertMP.js"];
    if (min === 0) {
      scripts.push("insertHM.js", "insertHU.js", "insertHP.js");
    }
    runScriptSequentially(scripts);
  }

  // 일 집계 (낮은 우선순위)
  if (hour === 0 && min === 10) {
    setTimeout(() => {
      runScriptSequentially(["insertDM.js", "insertDU.js", "insertDP.js"]);
    }, 30000);
  }

  // 주 집계 (가장 낮은 우선순위)
  if (day === 1 && hour === 0 && min === 30) {
    setTimeout(() => {
      runScriptSequentially(["insertWM.js", "insertWU.js", "insertWP.js"]);
    }, 60000);
  }
});

// 헬스체크 엔드포인트 (선택사항)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    currentJobs: Array.from(currentJobs),
    failedJobs: Array.from(failedJobs.keys())
  };
  res.json(health);
});

app.listen(PORT, () => {
  log(`🏥 헬스체크 서버 시작: http://localhost:${PORT}/health`);
});

log("🛡️ 안정적인 Worker 시작됨"); 
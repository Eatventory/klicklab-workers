# klicklab-workers

ClickHouse 데이터 집계 Worker 프로젝트

## 🚀 빠른 시작

### 1. 환경 설정
```bash
# 환경변수 파일 생성
cp env.example .env
# .env 파일에서 ClickHouse 연결 정보 설정
```

### 2. 배포
```bash
# 배포 스크립트 실행
./deploy.sh
```

### 3. 상태 확인
```bash
# PM2 상태 확인
pm2 status

# 로그 확인
pm2 logs klicklab-worker

# 모니터링
pm2 monit
```

## 📋 프로그램 설명

* **index.js** : `node index.js` 통합 스케줄러 프로그램
* **test.js** : `node test.js 2025-07-11 2025-07-12` 통합 테스트 프로그램

### 집계 프로그램들

* **insertM_.js** : `minutes_*` 테이블에 지난 10분 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertM_.js` : 지난 10분 데이터 집계
    * `node insertM_.js 2025-00-00T00:00` 특정 시간 (10분) 데이터 집계
* **insertH_.js** : `hourly_*` 테이블에 지난 1시간 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertH_.js` : 지난 1시간 데이터 집계
    * `node insertH_.js 2025-00-00T00` : 특정 시간 (1시간) 데이터 집계
* **insertD_.js** : `daily_*` 테이블에 어제자 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertD_.js` : 어제 날짜 데이터 집계
    * `node insertD_.js 2025-00-00` : 특정 날짜 데이터 집계
* **insertW_.js** : `weekly_*` 테이블에 지난 7일의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertW_.js` : 최근 7일 (어제까지) 데이터 집계
    * `node insertW_.js 2025-07-01` : 특정 시간 (7일) 데이터 집계 (예: 7월 1일 ~ 7월 7일)

## 🛠️ 관리 명령어

### 서비스 관리
```bash
# 서비스 시작
pm2 start ecosystem.config.js

# 서비스 중지
pm2 stop klicklab-worker

# 서비스 재시작
pm2 restart klicklab-worker

# 서비스 삭제
pm2 delete klicklab-worker
```

### 로그 확인
```bash
# 실시간 로그
pm2 logs klicklab-worker

# 에러 로그만
pm2 logs klicklab-worker --err

# 최근 100줄
pm2 logs klicklab-worker --lines 100
```

### 성능 모니터링
```bash
# 실시간 모니터링
pm2 monit

# 프로세스 정보
pm2 show klicklab-worker
```

## 📊 성능 예상치 (c6i.large 기준)

```
10분 집계: 2-3분 소요
시간 집계: 10-30초 소요
일/주 집계: 5-10초 소요
메모리 사용량: 2-3GB
CPU 사용률: 60-80%
```

## 🔄 업그레이드

### 안정성 개선 필요시
```bash
# stable-worker.js로 변경
sed -i 's/index.js/stable-worker.js/' ecosystem.config.js
pm2 restart klicklab-worker
```

### 성능 최적화 필요시
```bash
# worker-optimization.js로 변경
sed -i 's/stable-worker.js/worker-optimization.js/' ecosystem.config.js
pm2 restart klicklab-worker
```
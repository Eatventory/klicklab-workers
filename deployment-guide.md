# t3.small Worker 배포 가이드

## 🚀 인스턴스 사양
```
인스턴스 타입: t3.small
CPU: 2 vCPU (크레딧 기반)
RAM: 2GB
스토리지: 20GB gp3
네트워크: 최대 5 Gbps
월 비용: ~$17
```

## 📋 배포 단계

### 1. 인스턴스 생성
```bash
# AWS EC2 콘솔에서
- 인스턴스 타입: t3.small
- OS: Ubuntu 22.04 LTS
- 스토리지: 20GB gp3
- VPC: KlickLab-VPC-vpc
- 서브넷: KlickLab-VPC-subnet-private1-ap-northeast-2a
- 보안 그룹: Private-SG
- 퍼블릭 IP: 비활성화
- 키 페어: KlickLab-Key-v2
```

### 2. 서버 접속 (Bastion 서버 통해)
```bash
# Bastion 서버를 통해 Worker 서버 접속
ssh -i KlickLab-Key-v2.pem -J ubuntu@bastion-server-ip ubuntu@worker-private-ip

# 또는 Bastion 서버에서 직접 접속
ssh -i KlickLab-Key-v2.pem ubuntu@worker-private-ip
```

### 3. 환경 설정
```bash
# 서버 접속 후
sudo apt update
sudo apt install -y nodejs npm git

# Node.js 최신 버전 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 프로젝트 클론
git clone <your-repo-url>
cd klicklab-workers
npm install
```

### 4. 클러스터 환경변수 설정
```bash
# .env 파일 생성
cat > .env << EOF
CLICKHOUSE_HOST=10.0.3.77
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=""
CLICKHOUSE_PORT=9000
CLICKHOUSE_DATABASE=klicklab
NODE_ENV=production
LOG_LEVEL=info
WORKER_TIMEOUT=300000
WORKER_MAX_RETRIES=3
EOF
```

### 5. 클러스터 최적화 설정 적용
```bash
# 클러스터 환경용 설정으로 변경
cp config/clickhouse-cluster.js config/clickhouse.js
```

### 6. PM2 설치 및 설정
```bash
# PM2 설치
sudo npm install -g pm2

# 로그 디렉토리 생성
mkdir -p logs

# PM2 설정 파일이 이미 있으므로 그대로 사용
# ecosystem.config.js 확인
cat ecosystem.config.js
```

### 7. 서비스 시작
```bash
# PM2로 서비스 시작
pm2 start ecosystem.config.js

# 시스템 부팅시 자동 시작
pm2 startup
pm2 save
```

## 🔧 모니터링 설정

### 1. 로그 확인
```bash
# 실시간 로그 확인
pm2 logs klicklab-worker

# 로그 파일 확인
tail -f logs/combined.log
```

### 2. 상태 확인
```bash
# PM2 상태 확인
pm2 status

# 프로세스 정보
pm2 show klicklab-worker
```

### 3. 성능 모니터링
```bash
# CPU/메모리 사용량 확인
pm2 monit

# 집계 완료 시간 확인
pm2 logs klicklab-worker | grep "집계 완료"
```

## 📊 성능 예상치

### t3.small 기준:
```
10분 집계: 3-5분 소요 (CPU 크레딧 영향)
시간 집계: 30초-1분 소요
일/주 집계: 10-30초 소요
메모리 사용량: 500MB-1GB
CPU 사용률: 40-60%
```

## 🛠️ 문제 해결

### CPU 크레딧 부족시:
```bash
# CPU 크레딧 확인
cat /proc/cpuinfo | grep "cpu MHz"

# PM2 재시작
pm2 restart klicklab-worker
```

### 메모리 부족시:
```bash
# 메모리 사용량 확인
free -h

# PM2 재시작
pm2 restart klicklab-worker
```

### 연결 문제시:
```bash
# ClickHouse 서버 연결 확인
telnet your-write-only-clickhouse-server-ip 9000

# 네트워크 지연 확인
ping your-write-only-clickhouse-server-ip
```

### 로그 확인:
```bash
# 에러 로그 확인
pm2 logs klicklab-worker --err

# 최근 로그 확인
pm2 logs klicklab-worker --lines 100
```

## 🔄 업그레이드 가이드

### 성능 문제시:
```bash
# t3.medium으로 업그레이드
# 또는 c6i.small로 업그레이드
```

### 안정성 개선 필요시:
```bash
# stable-worker.js로 변경
sed -i 's/index.js/stable-worker.js/' ecosystem.config.js
pm2 restart klicklab-worker
```

### 성능 최적화 필요시:
```bash
# optimized-worker.js로 변경
sed -i 's/index.js/optimized-worker.js/' ecosystem.config.js
pm2 restart klicklab-worker
```

## 💡 비용 최적화

### 현재 비용:
```
t3.small 인스턴스: ~$15/월
20GB gp3 스토리지: ~$2/월
총 비용: ~$17/월
```

### c6i.large 대비 절약:
```
절약: $133/월 (88% 절약)
연간 절약: $1,596
``` 
# ClickHouse 클러스터 환경 Worker 배포 가이드

## 🏗️ 아키텍처 이해

```
SDK → 네트워크/중간처리 → Write-Only ClickHouse → ClickHouse Keeper → Read-Only ClickHouse
                                    ↑
                              Worker (c6i.large)
```

## 🚀 Worker 인스턴스 설정

### **인스턴스 사양**
```
인스턴스 타입: c6i.large
CPU: 2 vCPU
RAM: 4GB
스토리지: 100GB SSD
네트워크: 최대 12.5 Gbps
월 비용: ~$150
```

### **Worker에 ClickHouse 설치 불필요**
- Worker는 클라이언트 역할만 수행
- Write-Only ClickHouse 서버에 원격 연결
- `@clickhouse/client` 라이브러리 사용

## 📋 배포 단계

### 1. 인스턴스 생성
```bash
# AWS EC2 콘솔에서
- 인스턴스 타입: c6i.large
- OS: Ubuntu 22.04 LTS
- 스토리지: 100GB SSD
- 보안 그룹: SSH (22), HTTP (3000)
```

### 2. 네트워크 설정
```bash
# Write-Only ClickHouse 서버와 같은 VPC/서브넷 권장
# 보안 그룹에서 ClickHouse 포트 (9000) 허용
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
CLICKHOUSE_HOST=your-write-only-clickhouse-server-ip
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your-password
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

### 6. PM2 설정 및 시작
```bash
# PM2 설치
sudo npm install -g pm2

# 서비스 시작
pm2 start ecosystem.config.js

# 시스템 부팅시 자동 시작
pm2 startup
pm2 save
```

## 🔧 클러스터 환경 최적화

### 1. 네트워크 최적화
```bash
# 같은 가용영역(AZ)에 배치 권장
# 네트워크 지연 최소화
```

### 2. 연결 안정성
```bash
# 연결 재시도 설정
# 타임아웃 증가 (클러스터 환경에서 더 오래 걸림)
```

### 3. 쿼리 최적화
```bash
# 파티션 프루닝 활용
# 인덱스 최적화
# 메모리 사용량 제한
```

## 📊 클러스터 환경 성능 예상치

### c6i.large 기준:
```
10분 집계: 3-5분 소요 (네트워크 오버헤드)
시간 집계: 30초-1분 소요
일/주 집계: 10-30초 소요
메모리 사용량: 2-3GB
네트워크 사용량: 중간
```

## 🛠️ 문제 해결

### 연결 문제:
```bash
# 네트워크 연결 확인
telnet your-write-only-clickhouse-server-ip 9000

# ClickHouse 서버 상태 확인
curl http://your-write-only-clickhouse-server-ip:8123/ping
```

### 성능 문제:
```bash
# 네트워크 지연 확인
ping your-write-only-clickhouse-server-ip

# 쿼리 실행 시간 모니터링
pm2 logs klicklab-worker | grep "집계 완료"
```

### 클러스터 장애 대응:
```bash
# Keeper 장애시
# - Worker는 계속 동작 (Write-Only 서버에 직접 연결)
# - 복제 지연 발생 가능
# - 모니터링으로 상태 확인
```

## 🔄 모니터링

### 1. Worker 상태
```bash
pm2 status
pm2 logs klicklab-worker
```

### 2. 클러스터 상태
```bash
# Write-Only 서버 상태
curl http://your-write-only-clickhouse-server-ip:8123/query -d "SELECT * FROM system.clusters"

# Keeper 상태
curl http://your-keeper-server-ip:9181/metrics
```

### 3. 성능 지표
```bash
# 집계 완료 시간 모니터링
pm2 logs klicklab-worker | grep "집계 완료" | tail -10

# 메모리 사용량
pm2 monit
```

## 💡 클러스터 환경 장점

1. **고가용성**: Keeper를 통한 자동 failover
2. **확장성**: 필요시 Read-Only 서버 추가 가능
3. **성능**: Write/Read 분리로 성능 최적화
4. **안정성**: 복제를 통한 데이터 보호 
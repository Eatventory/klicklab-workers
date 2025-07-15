# 네트워크 설정 가이드

## 🌐 VPC & 서브넷 설정

### **권장 설정:**
```
VPC: Write-Only ClickHouse와 동일
서브넷: Write-Only ClickHouse와 동일
가용영역(AZ): Write-Only ClickHouse와 동일 (최적)
```

**장점:**
- 네트워크 지연 최소화
- 보안 그룹 규칙 간소화
- 라우팅 최적화

## 🔒 보안 그룹 설정

### **Worker 전용 보안 그룹 (권장)**
```
인바운드 규칙:
- SSH (22): 0.0.0.0/0 (관리용)
- HTTP (3000): 0.0.0.0/0 (헬스체크용)

아웃바운드 규칙:
- ClickHouse (9000): Write-Only 서버 IP
- HTTPS (443): 0.0.0.0/0 (npm, git 등)
- HTTP (80): 0.0.0.0/0 (apt 등)
```

### **Write-Only 보안 그룹에 Worker 추가**
```
인바운드 규칙 추가:
- ClickHouse (9000): Worker 보안 그룹 ID
```

## 💾 스토리지 구성

### **권장 스토리지 설정:**
```
크기: 20GB
타입: gp3 (SSD)
IOPS: 3000 (기본)
처리량: 125 MB/s (기본)
```

### **스토리지 사용량 예상:**
```
운영체제: ~8GB
Node.js + 의존성: ~500MB
프로젝트 코드: ~50MB
로그 파일: ~2GB (월간)
여유분: ~9GB
총 필요량: ~20GB
```

### **gp3 vs gp2 비교:**
```
gp3 (권장):
- 더 저렴한 비용
- 일관된 성능
- 독립적인 IOPS/처리량 설정

gp2:
- IOPS가 스토리지 크기에 비례
- 더 비쌀 수 있음
```

## 🔧 실제 설정 예시

### **1. Worker 보안 그룹 생성**
```bash
# AWS 콘솔에서
보안 그룹 이름: klicklab-worker-sg
설명: Worker 전용 보안 그룹

인바운드 규칙:
- SSH (22): 0.0.0.0/0
- HTTP (3000): 0.0.0.0/0

아웃바운드 규칙:
- 모든 트래픽: 0.0.0.0/0
```

### **2. Write-Only 보안 그룹 수정**
```bash
# Write-Only ClickHouse 보안 그룹에 추가
인바운드 규칙 추가:
- ClickHouse (9000): klicklab-worker-sg
```

### **3. 인스턴스 생성시 설정**
```bash
# EC2 인스턴스 생성시
VPC: Write-Only와 동일
서브넷: Write-Only와 동일
보안 그룹: klicklab-worker-sg
스토리지: 20GB gp3
```

## 📊 비용 예상

### **네트워크 비용:**
```
VPC 내 통신: 무료
스토리지 (20GB gp3): ~$2/월
총 네트워크 비용: ~$2/월
```

### **전체 비용 (t3.small 기준):**
```
인스턴스: $15/월
스토리지: $2/월
네트워크: $0/월 (VPC 내)
총 비용: ~$17/월
```

## 🚀 최적화 팁

### **1. 같은 가용영역(AZ) 사용**
```
Write-Only와 Worker를 같은 AZ에 배치
- 네트워크 지연 최소화
- 데이터 전송 비용 절약
```

### **2. 프라이빗 서브넷 고려**
```
Worker를 프라이빗 서브넷에 배치
- 보안 강화
- NAT Gateway 비용 발생
```

### **3. 로그 로테이션 설정**
```bash
# 로그 크기 제한
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
``` 
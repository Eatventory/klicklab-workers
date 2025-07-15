#!/bin/bash

# klicklab-workers 배포 스크립트
echo "🚀 klicklab-workers 배포 시작..."

# 1. 의존성 설치
echo "📦 의존성 설치 중..."
npm install

# 2. 로그 디렉토리 생성
echo "📁 로그 디렉토리 생성..."
mkdir -p logs

# 3. 환경변수 파일 확인
if [ ! -f .env ]; then
    echo "⚠️ .env 파일이 없습니다. env.example을 복사하여 설정하세요."
    echo "cp env.example .env"
    echo "그 후 .env 파일에서 ClickHouse 연결 정보를 설정하세요."
    exit 1
fi

# 4. PM2 설치 확인
if ! command -v pm2 &> /dev/null; then
    echo "📦 PM2 설치 중..."
    sudo npm install -g pm2
fi

# 5. 기존 프로세스 중지
echo "🛑 기존 프로세스 중지..."
pm2 stop klicklab-worker 2>/dev/null || true
pm2 delete klicklab-worker 2>/dev/null || true

# 6. 새 프로세스 시작
echo "▶️ 새 프로세스 시작..."
pm2 start ecosystem.config.js

# 7. PM2 설정 저장
echo "💾 PM2 설정 저장..."
pm2 save

# 8. 상태 확인
echo "📊 상태 확인..."
pm2 status

echo "✅ 배포 완료!"
echo "📝 로그 확인: pm2 logs klicklab-worker"
echo "�� 모니터링: pm2 monit" 
# ClickHouse 성능 최적화 설정

## 메모리 설정 (/etc/clickhouse-server/config.xml)

```xml
<clickhouse>
    <!-- 메모리 설정 -->
    <max_memory_usage>24GB</max_memory_usage>
    <max_memory_usage_for_user>20GB</max_memory_usage_for_user>
    
    <!-- 병렬 처리 -->
    <max_threads>16</max_threads>
    <max_insert_threads>8</max_insert_threads>
    
    <!-- 배치 처리 -->
    <max_insert_block_size>1000000</max_insert_block_size>
    <min_insert_block_size_rows>1000</min_insert_block_size_rows>
    
    <!-- 백그라운드 병합 -->
    <background_pool_size>16</background_pool_size>
    <background_schedule_pool_size>16</background_schedule_pool_size>
</clickhouse>
```

## 테이블 최적화

### events 테이블 (원본 데이터)
```sql
CREATE TABLE klicklab.events (
    timestamp DateTime64(3),
    client_id String,
    sdk_key String,
    event_name String,
    -- 기타 필드들
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (sdk_key, timestamp, client_id)
SETTINGS index_granularity = 8192;
```

### 집계 테이블들
```sql
-- 10분 집계
CREATE TABLE klicklab.minutes_metrics (
    date_time DateTime,
    clicks UInt32,
    visitors UInt32,
    new_visitors UInt32,
    existing_visitors UInt32,
    avg_session_seconds UInt32,
    sdk_key String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date_time)
ORDER BY (sdk_key, date_time);
```

## 네트워크 최적화
- ClickHouse 서버와 Worker 간 네트워크 대역폭: 최소 10Gbps
- 같은 가용영역(AZ) 내 배치로 네트워크 지연 최소화 
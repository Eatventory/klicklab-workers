# ClickHouse 메모리 최적화 설정

## 메모리 사용량 최적화

### 1. 기본 메모리 설정 (/etc/clickhouse-server/config.xml)
```xml
<clickhouse>
    <!-- 전체 메모리 제한 -->
    <max_memory_usage>4GB</max_memory_usage>
    <max_memory_usage_for_user>3GB</max_memory_usage_for_user>
    
    <!-- 쿼리별 메모리 제한 -->
    <max_memory_usage_for_all_queries>2GB</max_memory_usage_for_all_queries>
    
    <!-- 임시 테이블 메모리 -->
    <max_bytes_before_external_group_by>1GB</max_bytes_before_external_group_by>
    <max_bytes_before_external_sort>1GB</max_bytes_before_external_sort>
    
    <!-- 병렬 처리 -->
    <max_threads>4</max_threads>
    <max_insert_threads>2</max_insert_threads>
</clickhouse>
```

### 2. 테이블 최적화
```sql
-- 파티션 크기 최적화 (10분 단위)
CREATE TABLE klicklab.events (
    timestamp DateTime64(3),
    client_id String,
    sdk_key String,
    event_name String,
    -- 기타 필드들
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(toStartOfTenMinutes(timestamp)) -- 10분 단위 파티션
ORDER BY (sdk_key, timestamp, client_id)
SETTINGS 
    index_granularity = 8192,
    min_bytes_for_wide_part = 0, -- 작은 파티션 허용
    min_rows_for_wide_part = 0;
```

### 3. 메모리 효율적인 집계 쿼리
```sql
-- 메모리 효율적인 10분 집계
INSERT INTO klicklab.minutes_metrics
SELECT
    toStartOfTenMinutes(e.timestamp) AS date_time,
    countIf(e.event_name = 'auto_click') AS clicks,
    count(DISTINCT e.client_id) AS visitors,
    -- 기타 집계
    e.sdk_key
FROM (
    SELECT client_id, timestamp, sdk_key, event_name
    FROM klicklab.events
    WHERE timestamp >= toDateTime('${start}')
      AND timestamp < toDateTime('${end}')
) AS e
GROUP BY date_time, e.sdk_key
SETTINGS 
    max_memory_usage = 2GB,
    max_bytes_before_external_group_by = 1GB;
```

## 실제 메모리 사용량 예상

### c6i.large (4GB RAM) 기준:
```
- 운영체제: 500MB
- ClickHouse 서버: 1GB
- 쿼리 실행: 1-2GB
- 여유분: 500MB-1GB
```

### t3.large (8GB RAM) 기준:
```
- 운영체제: 500MB
- ClickHouse 서버: 1GB
- 쿼리 실행: 2-3GB
- 여유분: 3-4GB
```

## 메모리 부족 시 ClickHouse 동작

### 1. 외부 정렬 (External Sort)
- 메모리 부족시 디스크에 임시 파일 생성
- 성능은 느려지지만 정상 동작

### 2. 스트리밍 처리
- 전체 데이터를 메모리에 로드하지 않음
- 청크 단위로 처리

### 3. 파티션 단위 처리
- 필요한 파티션만 메모리에 로드
- 나머지는 디스크에서 처리 
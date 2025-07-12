* index.js : `node index.js` 통합 스케줄러 프로그램
* test.js : `node test.js 2025-07-01` 통합 테스트 프로그램 (예: 7월 1일 ~ 어제 날짜)
---
* insertM_.js : `minutes_*` 테이블에 지난 10분 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertM_.js` : 지난 10분 데이터 집계
    * `node insertM_.js 2025-00-00T00:00` 특정 시간 (10분) 데이터 집계
* insertH_.js : `hourly_*` 테이블에 지난 1시간 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertH_.js` : 지난 1시간 데이터 집계
    * `node insertH_.js 2025-00-00T00` : 특정 시간 (1시간) 데이터 집계
* insertD_.js : `daily_*` 테이블에 어제자 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertD_.js` : 어제 날짜 데이터 집계
    * `node insertD_.js 2025-00-00` : 특정 날짜 데이터 집계
* insertW_.js : `weekly_*` 테이블에 지난 7일의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertW_.js` : 최근 7일 (어제까지) 데이터 집계
    * `node insertW_.js 2025-07-01` : 특정 시간 (7일) 데이터 집계 (예: 7월 1일 ~ 7월 7일)
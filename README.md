* index.js : 통합 스케줄러 프로그램
    * `node index.js`
---
* insertMM.js : `minutes_metrics` 테이블에 지난 10분 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertMM.js` : 지난 10분 데이터 집계
    * `node insertMM.js 2025-00-00T00:00` 특정 시간 (10분) 데이터 집계
* insertHM.js : `hourly_metrics` 테이블에 지난 1시간 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertHM.js` : 지난 1시간 데이터 집계
    * `node insertHM.js 2025-00-00T00` : 특정 시간 (1시간) 데이터 집계
* insertDM.js : `daily_metrics` 테이블에 어제자 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertDM.js` : 어제 날짜 데이터 집계
    * `node insertDM.js 2025-00-00` : 특정 날짜 데이터 집계
* insertWM.js : `weekly_metrics` 테이블에 지난 7일의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertWM.js` : 최근 7일 (어제까지) 데이터 집계
    * `node insertWM.js 2025-07-01` : 특정 시간 (7일) 데이터 집계 (예: 7월 1일 ~ 7월 7일)
---
* insertMU.js : `minutes_*` 테이블에 지난 10분 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertMU.js` : 지난 10분 데이터 집계
    * `node insertMU.js 2025-00-00T00:00` : 특정 시간 (10분) 데이터 집계
* insertHU.js : `hourly_*` 테이블에 지난 1시간 동안의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertHU.js` : 지난 1시간 데이터 집계
    * `node insertHU.js 2025-00-00T00` : 특정 시간 (1시간) 데이터 집계
* insertDU.js : `daily_*` 테이블에 어제자 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertDU.js` : 어제 날짜 데이터 집계
    * `node insertDU.js 2025-00-00` : 특정 날짜 데이터 집계
* insertWU.js : `weekly_*` 테이블에 지난 7일의 집계 데이터를 INSERT하는 프로그램입니다.
    * `node insertWU.js` : 최근 7일 (어제까지) 데이터 집계
    * `node insertWU.js 2025-07-01` : 특정 시간 (7일) 데이터 집계 (예: 7월 1일 ~ 7월 7일)
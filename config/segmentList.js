const SEGMENT_LIST = [
  { type: "device_type", expr: "device_type" },
  {
    type: "user_age",
    expr: `CASE
      WHEN user_age BETWEEN 10 AND 19 THEN '10s'
      WHEN user_age BETWEEN 20 AND 29 THEN '20s'
      WHEN user_age BETWEEN 30 AND 39 THEN '30s'
      WHEN user_age BETWEEN 40 AND 49 THEN '40s'
      WHEN user_age BETWEEN 50 AND 59 THEN '50s'
      WHEN user_age >= 60 THEN '60s+'
      ELSE 'unknown'
    END`,
  },
  { type: "user_gender", expr: "user_gender" },
  { type: "country", expr: "country" },
  { type: "traffic_source", expr: "traffic_source" },
];

module.exports = SEGMENT_LIST;

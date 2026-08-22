-- =========================================================
-- PurifieldWater — TimescaleDB Policies
-- Run AFTER tables are created by SQLAlchemy (app startup)
-- This script is meant to be executed manually or via
-- an app startup hook after create_all()
-- =========================================================

-- =========================================================
-- 1. Convert sensor_readings to a hypertable
-- =========================================================
-- Note: This must run AFTER the table is created by SQLAlchemy.
-- If the table doesn't exist yet, this will be handled by
-- the app's init_db() function instead.
-- =========================================================

-- SELECT create_hypertable('sensor_readings', 'time',
--     if_not_exists => TRUE,
--     migrate_data => TRUE
-- );

-- =========================================================
-- 2. Continuous Aggregate: 1-hour averages from 1-min data
--    Retention: 3 years
-- =========================================================

-- CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_1hour
-- WITH (timescaledb.continuous) AS
-- SELECT
--     time_bucket('1 hour', time) AS bucket,
--     device_name,
--     metric_name,
--     AVG(avg_value)   AS avg_value,
--     MIN(min_value)   AS min_value,
--     MAX(max_value)   AS max_value,
--     AVG(raw_avg)     AS raw_avg,
--     MIN(raw_min)     AS raw_min,
--     MAX(raw_max)     AS raw_max,
--     SUM(sample_count) AS sample_count
-- FROM sensor_readings
-- GROUP BY bucket, device_name, metric_name
-- WITH NO DATA;

-- =========================================================
-- 3. Retention Policies
-- =========================================================
-- 1-min raw data: keep 6 months
-- SELECT add_retention_policy('sensor_readings', INTERVAL '6 months', if_not_exists => TRUE);

-- 1-hour aggregates: keep 3 years
-- SELECT add_retention_policy('sensor_readings_1hour', INTERVAL '3 years', if_not_exists => TRUE);

-- =========================================================
-- 4. Compression Policy
--    Compress 1-min data older than 7 days
-- =========================================================
-- ALTER TABLE sensor_readings SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'device_name, metric_name',
--     timescaledb.compress_orderby = 'time DESC'
-- );
-- SELECT add_compression_policy('sensor_readings', INTERVAL '7 days', if_not_exists => TRUE);

-- =========================================================
-- 5. Continuous Aggregate Refresh Policy
-- =========================================================
-- SELECT add_continuous_aggregate_policy('sensor_readings_1hour',
--     start_offset    => INTERVAL '2 hours',
--     end_offset      => INTERVAL '1 hour',
--     schedule_interval => INTERVAL '1 hour',
--     if_not_exists   => TRUE
-- );

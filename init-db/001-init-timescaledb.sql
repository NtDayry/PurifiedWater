-- =========================================================
-- PurifieldWater — TimescaleDB Extension Initialization
-- This script runs automatically on first database startup
-- via docker-entrypoint-initdb.d
-- =========================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable pg_trgm for fuzzy search (also used by the app)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extensions are loaded
DO $$
BEGIN
    RAISE NOTICE 'TimescaleDB version: %', (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb');
    RAISE NOTICE 'pg_trgm loaded: %', (SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'));
END $$;

-- Migration: Fix generate_job_id to use hex encoding instead of base64
-- Reason: base64 encoding includes '+', '/', and '=' characters which are
-- URL-unsafe and cause 500 errors when job IDs are passed as query parameters
-- without proper URL encoding. Hex encoding uses only [0-9a-f] characters.
-- Applied: 2026-05-09

CREATE OR REPLACE FUNCTION generate_job_id(job_type TEXT DEFAULT 'import')
RETURNS TEXT AS $$
BEGIN
  RETURN job_type || '_' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT || '_' ||
         SUBSTRING(encode(gen_random_bytes(6), 'hex') FROM 1 FOR 8);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_job_id(TEXT) IS 'Generates unique job IDs with timestamp and random hex component (URL-safe)';

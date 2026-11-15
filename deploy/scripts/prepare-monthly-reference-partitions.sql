-- Run on Iran with psql -X -v ON_ERROR_STOP=1 -d dota_notes -f this-file.sql.
-- Parent ownership stays with dota_notes_app; compute receives DML only.
-- Covers eleven completed months, this month and next month in UTC. Run at
-- every owner-side deployment and at least monthly when there is no deployment.
BEGIN;
SET LOCAL ROLE dota_notes_app;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL DateStyle = 'ISO, YMD';
SELECT pg_catalog.pg_advisory_xact_lock(2741073);

DO $partitions$
DECLARE
  parent_name text;
  child_name text;
  lower_month date;
  upper_month date;
  offset_month integer;
  parent_id oid;
  child_id oid;
  valid_partition boolean;
  this_month date := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
BEGIN
  FOREACH parent_name IN ARRAY ARRAY[
    'monthly_hero_position_meta',
    'monthly_hero_performance_reference',
    'monthly_position_performance_reference'
  ] LOOP
    SELECT c.oid INTO parent_id FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = parent_name
        AND c.relkind = 'p' AND c.relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER);
    IF parent_id IS NULL THEN
      RAISE EXCEPTION 'Missing partitioned parent or unexpected owner: public.%', parent_name;
    END IF;
    FOR offset_month IN -11..1 LOOP
      lower_month := (this_month + offset_month * interval '1 month')::date;
      upper_month := (lower_month + interval '1 month')::date;
      child_name := parent_name || '_' || to_char(lower_month, 'YYYY_MM');
      child_id := pg_catalog.to_regclass(pg_catalog.format('public.%I', child_name));
      IF child_id IS NULL THEN
        EXECUTE pg_catalog.format('CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          child_name, parent_name, lower_month, upper_month);
        child_id := pg_catalog.to_regclass(pg_catalog.format('public.%I', child_name));
      END IF;
      SELECT c.relkind = 'r' AND c.relispartition
        AND c.relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER)
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid = c.oid AND i.inhparent = parent_id)
        AND pg_catalog.pg_get_expr(c.relpartbound, c.oid) = pg_catalog.format('FOR VALUES FROM (%L) TO (%L)', lower_month, upper_month)
        INTO valid_partition FROM pg_catalog.pg_class c WHERE c.oid = child_id;
      IF valid_partition IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Unexpected partition owner, attachment or bounds: public.%', child_name;
      END IF;
      EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO dota_notes_compute', child_name);
    END LOOP;
  END LOOP;
END
$partitions$;
COMMIT;

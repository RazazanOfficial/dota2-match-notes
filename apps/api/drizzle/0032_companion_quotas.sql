ALTER TABLE companion_devices
  ADD COLUMN lookup_window_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN lookup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN report_window_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN report_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE companion_devices
  ADD CONSTRAINT companion_devices_lookup_count_check CHECK (lookup_count >= 0),
  ADD CONSTRAINT companion_devices_report_count_check CHECK (report_count >= 0);
--> statement-breakpoint
ALTER TABLE users
  ADD COLUMN companion_lookup_window_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN companion_lookup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN companion_report_window_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN companion_report_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE users
  ADD CONSTRAINT users_companion_lookup_count_check CHECK (companion_lookup_count >= 0),
  ADD CONSTRAINT users_companion_report_count_check CHECK (companion_report_count >= 0);

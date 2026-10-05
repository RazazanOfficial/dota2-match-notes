CREATE TABLE "external_api_rate_limits" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_api_rate_limits_count_check" CHECK ("external_api_rate_limits"."request_count" >= 0)
);

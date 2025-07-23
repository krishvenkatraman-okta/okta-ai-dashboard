CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"okta_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"license_seats_saved" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"message" text NOT NULL,
	"response" text,
	"message_type" text NOT NULL,
	"command" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pam_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"resource_name" text NOT NULL,
	"status" text NOT NULL,
	"start_time" timestamp DEFAULT now(),
	"end_time" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"okta_tokens" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "user_gamification" (
	"id" serial PRIMARY KEY NOT NULL,
	"okta_id" text NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"daily_streak" integer DEFAULT 0 NOT NULL,
	"total_license_seats_saved" integer DEFAULT 0 NOT NULL,
	"access_requests_submitted" integer DEFAULT 0 NOT NULL,
	"access_revocations" integer DEFAULT 0 NOT NULL,
	"governance_reviews_completed" integer DEFAULT 0 NOT NULL,
	"badges_earned" jsonb DEFAULT '[]'::jsonb,
	"level" integer DEFAULT 1 NOT NULL,
	"experience_points" integer DEFAULT 0 NOT NULL,
	"next_level_progress" integer DEFAULT 0 NOT NULL,
	"last_visit" timestamp,
	"fastpass_verified" boolean DEFAULT false NOT NULL,
	"last_fastpass_check" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_gamification_okta_id_unique" UNIQUE("okta_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"okta_id" text NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"all_roles" jsonb DEFAULT '[]'::jsonb,
	"groups" jsonb DEFAULT '[]'::jsonb,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_okta_id_unique" UNIQUE("okta_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pam_sessions" ADD CONSTRAINT "pam_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
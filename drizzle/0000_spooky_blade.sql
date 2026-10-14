CREATE TABLE `vehicle_fuel_types` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`fuel_type` text NOT NULL,
	`avg_consumption_per100_km` integer,
	`is_consumption_measured` integer DEFAULT false NOT NULL,
	`last_unit_price_kurus` integer,
	`is_primary` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vehicle_fuel_types_vehicle_idx` ON `vehicle_fuel_types` (`vehicle_id`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`label` text NOT NULL,
	`plate` text,
	`make` text,
	`model` text,
	`model_year` integer,
	`ownership` text DEFAULT 'owned' NOT NULL,
	`initial_odometer_km` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `vehicles_user_idx` ON `vehicles` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `earning_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`default_commission_bps` integer DEFAULT 0 NOT NULL,
	`color_hex` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `earning_sources_user_idx` ON `earning_sources` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `rides` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`shift_id` text,
	`earning_source_id` text NOT NULL,
	`vehicle_id` text,
	`occurred_at` integer NOT NULL,
	`business_date` text NOT NULL,
	`gross_amount_kurus` integer NOT NULL,
	`commission_kurus` integer DEFAULT 0 NOT NULL,
	`net_amount_kurus` integer NOT NULL,
	`commission_bps` integer DEFAULT 0 NOT NULL,
	`tip_kurus` integer DEFAULT 0 NOT NULL,
	`payment_method` text DEFAULT 'app' NOT NULL,
	`distance_meters` integer,
	`duration_seconds` integer,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `rides_user_date_idx` ON `rides` (`user_id`,`business_date`);--> statement-breakpoint
CREATE INDEX `rides_shift_idx` ON `rides` (`shift_id`);--> statement-breakpoint
CREATE INDEX `rides_source_idx` ON `rides` (`earning_source_id`);--> statement-breakpoint
CREATE INDEX `rides_occurred_idx` ON `rides` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`start_odometer_km` integer,
	`end_odometer_km` integer,
	`business_date` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `shifts_user_date_idx` ON `shifts` (`user_id`,`business_date`);--> statement-breakpoint
CREATE INDEX `shifts_open_idx` ON `shifts` (`user_id`,`ended_at`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`kind` text DEFAULT 'variable' NOT NULL,
	`icon` text,
	`is_system` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expense_categories_user_idx` ON `expense_categories` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`category_id` text NOT NULL,
	`vehicle_id` text,
	`amount_kurus` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`business_date` text NOT NULL,
	`receipt_path` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `expenses_user_date_idx` ON `expenses` (`user_id`,`business_date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_vehicle_idx` ON `expenses` (`vehicle_id`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`category_id` text NOT NULL,
	`vehicle_id` text,
	`name` text NOT NULL,
	`amount_kurus` integer NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `recurring_expenses_user_idx` ON `recurring_expenses` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `fuel_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`fuel_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`business_date` text NOT NULL,
	`volume_per1000` integer NOT NULL,
	`unit_price_kurus` integer NOT NULL,
	`total_amount_kurus` integer NOT NULL,
	`odometer_km` integer,
	`is_full_tank` integer DEFAULT true NOT NULL,
	`station_name` text,
	`receipt_path` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `fuel_logs_user_date_idx` ON `fuel_logs` (`user_id`,`business_date`);--> statement-breakpoint
CREATE INDEX `fuel_logs_vehicle_idx` ON `fuel_logs` (`vehicle_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `fuel_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`region_code` text NOT NULL,
	`fuel_type` text NOT NULL,
	`unit_price_kurus` integer NOT NULL,
	`effective_date` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fuel_prices_unique_idx` ON `fuel_prices` (`region_code`,`fuel_type`,`effective_date`);--> statement-breakpoint
CREATE INDEX `fuel_prices_lookup_idx` ON `fuel_prices` (`region_code`,`fuel_type`,`effective_date`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`day_cutoff_hour` integer DEFAULT 4 NOT NULL,
	`default_vehicle_id` text,
	`region_code` text DEFAULT 'TR' NOT NULL,
	`default_earning_source_id` text,
	`onboarding_completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`period` text DEFAULT 'daily' NOT NULL,
	`target_net_kurus` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_user_idx` ON `goals` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_attempt_at` integer,
	`next_attempt_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_row_unique_idx` ON `outbox` (`table_name`,`row_id`);--> statement-breakpoint
CREATE INDEX `outbox_ready_idx` ON `outbox` (`next_attempt_at`,`id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);

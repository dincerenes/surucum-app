PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vehicles` (
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
	`wear_per_km_kurus` integer DEFAULT 250 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_vehicles`("id", "user_id", "created_at", "updated_at", "deleted_at", "label", "plate", "make", "model", "model_year", "ownership", "initial_odometer_km", "wear_per_km_kurus", "is_active", "sort_order", "notes") SELECT "id", "user_id", "created_at", "updated_at", "deleted_at", "label", "plate", "make", "model", "model_year", "ownership", "initial_odometer_km", "wear_per_km_kurus", "is_active", "sort_order", "notes" FROM `vehicles`;--> statement-breakpoint
DROP TABLE `vehicles`;--> statement-breakpoint
ALTER TABLE `__new_vehicles` RENAME TO `vehicles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `vehicles_user_idx` ON `vehicles` (`user_id`,`is_active`);--> statement-breakpoint
ALTER TABLE `shifts` ADD `commission_kurus` integer;
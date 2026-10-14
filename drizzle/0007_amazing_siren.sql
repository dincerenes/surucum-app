CREATE TABLE `sync_recovery_seen` (
	`user_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `table_name`, `row_id`)
);
--> statement-breakpoint
DROP INDEX `outbox_ready_idx`;--> statement-breakpoint
ALTER TABLE `outbox` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `outbox_user_ready_idx` ON `outbox` (`user_id`,`next_attempt_at`,`id`);
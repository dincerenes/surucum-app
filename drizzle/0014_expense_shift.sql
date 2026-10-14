ALTER TABLE `expenses` ADD `shift_id` text;--> statement-breakpoint
CREATE INDEX `expenses_shift_idx` ON `expenses` (`shift_id`);
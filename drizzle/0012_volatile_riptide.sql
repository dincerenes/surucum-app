ALTER TABLE `fuel_logs` ADD `shift_id` text;--> statement-breakpoint
CREATE INDEX `fuel_logs_shift_idx` ON `fuel_logs` (`shift_id`);
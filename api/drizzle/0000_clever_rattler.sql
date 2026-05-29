CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`prompt_id` text,
	`config` text NOT NULL,
	`workflow_snapshot` text NOT NULL,
	`image_url` text,
	`error` text,
	`scheduled_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `generations_work_id_idx` ON `generations` (`work_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`last_login_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`active_generation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `works_user_id_idx` ON `works` (`user_id`);
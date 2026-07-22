CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE `local_credentials` (
	`email` varchar(320) NOT NULL,
	`userId` int NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_credentials_email` PRIMARY KEY(`email`),
	CONSTRAINT `local_credentials_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `local_credentials` ADD CONSTRAINT `local_credentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `openId`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `loginMethod`;
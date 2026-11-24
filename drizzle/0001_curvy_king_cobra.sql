CREATE TABLE `job_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(32) NOT NULL,
	`workerId` int NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'Interested',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` varchar(32) NOT NULL,
	`clientId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`trade` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`locationText` varchar(255) NOT NULL,
	`latitudeE6` int,
	`longitudeE6` int,
	`radiusKm` int NOT NULL DEFAULT 10,
	`budgetAmount` int NOT NULL,
	`startDate` varchar(32) NOT NULL,
	`contactPreference` varchar(32) NOT NULL DEFAULT 'Call me',
	`status` varchar(32) NOT NULL DEFAULT 'Posted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(32) NOT NULL,
	`clientId` int NOT NULL,
	`workerId` int NOT NULL,
	`score` int NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ratings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` varchar(32) NOT NULL,
	`reporterId` int NOT NULL,
	`reportedUserId` int,
	`reportedJobId` varchar(32),
	`subjectType` varchar(32) NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'Review',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedBy` int,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(32),
	`experience` text,
	`serviceArea` varchar(255) NOT NULL DEFAULT 'Eldoret',
	`availability` int NOT NULL DEFAULT 1,
	`latitudeE6` int,
	`longitudeE6` int,
	`profilePhotoUrl` text,
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `worker_skills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`trade` varchar(64) NOT NULL,
	CONSTRAINT `worker_skills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` varchar(16) NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `job_responses` ADD CONSTRAINT `job_responses_jobId_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_responses` ADD CONSTRAINT `job_responses_workerId_worker_profiles_id_fk` FOREIGN KEY (`workerId`) REFERENCES `worker_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_clientId_users_id_fk` FOREIGN KEY (`clientId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_jobId_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_clientId_users_id_fk` FOREIGN KEY (`clientId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_workerId_worker_profiles_id_fk` FOREIGN KEY (`workerId`) REFERENCES `worker_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporterId_users_id_fk` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reportedUserId_users_id_fk` FOREIGN KEY (`reportedUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reportedJobId_jobs_id_fk` FOREIGN KEY (`reportedJobId`) REFERENCES `jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_profiles` ADD CONSTRAINT `worker_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_skills` ADD CONSTRAINT `worker_skills_workerId_worker_profiles_id_fk` FOREIGN KEY (`workerId`) REFERENCES `worker_profiles`(`id`) ON DELETE no action ON UPDATE no action;
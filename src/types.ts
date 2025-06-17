export interface RepositoryTracking {
	repository: string;
	trackIssues: boolean;
	issueUpdateMode: "none" | "update" | "append";
	allowDeleteIssue: boolean;
	issueFolder: string;
	trackPullRequest: boolean;
	pullRequestFolder: string;
	pullRequestUpdateMode: "none" | "update" | "append";
	allowDeletePullRequest: boolean;
}

export interface GitHubTrackerSettings {
	githubToken: string;
	repositories: RepositoryTracking[];
	dateFormat: string;
	syncOnStartup: boolean;
	syncNoticeMode: "minimal" | "normal" | "extensive" | "debug";
	syncInterval: number;
	escapeMode: "disabled" | "normal" | "strict" | "veryStrict";
	enableBackgroundSync: boolean;
	backgroundSyncInterval: number; // in minutes
	cleanupClosedIssuesDays: number;
}

export const DEFAULT_SETTINGS: GitHubTrackerSettings = {
	githubToken: "",
	repositories: [],
	dateFormat: "",
	syncOnStartup: true,
	syncNoticeMode: "normal",
	syncInterval: 0,
	escapeMode: "strict",
	enableBackgroundSync: false,
	backgroundSyncInterval: 30,
	cleanupClosedIssuesDays: 30,
};

// Default repository tracking settings
export const DEFAULT_REPOSITORY_TRACKING: RepositoryTracking = {
	repository: "",
	trackIssues: true,
	issueUpdateMode: "none",
	allowDeleteIssue: true,
	issueFolder: "GitHub",
	trackPullRequest: false,
	pullRequestFolder: "GitHub Pull Requests",
	pullRequestUpdateMode: "none",
	allowDeletePullRequest: true,
};

import { Notice, Plugin } from "obsidian";
import {
	GitHubTrackerSettings,
	DEFAULT_SETTINGS,
	DEFAULT_REPOSITORY_TRACKING,
} from "./types";
import { GitHubClient } from "./github-client";
import { FileManager } from "./file-manager";
import { GitHubTrackerSettingTab } from "./settings-tab";
import { NoticeManager } from "./notice-manager";

export default class GitHubTrackerPlugin extends Plugin {
	settings: GitHubTrackerSettings = DEFAULT_SETTINGS;
	private gitHubClient: GitHubClient | null = null;
	private fileManager: FileManager | null = null;
	private noticeManager!: NoticeManager;
	private isSyncing: boolean = false;
	currentUser: string = "";
	private backgroundSyncIntervalId: number | null = null;

	async sync() {
		if (this.isSyncing) {
			this.noticeManager.warning("Already syncing...");
			return;
		}

		this.isSyncing = true;
		try {
			this.noticeManager.info("Syncing issues and pull requests");
			await this.fetchIssues();
			await this.fetchPullRequests();
			await this.fileManager?.cleanupEmptyFolders();

			this.noticeManager.success("Synced issues and pull requests");
		} catch (error: unknown) {
			this.noticeManager.error(
				"Error syncing issues and pull requests",
				error,
			);
		}
		this.isSyncing = false;
	}

	async onload() {
		await this.loadSettings();

		this.noticeManager = new NoticeManager(this.settings);
		this.gitHubClient = new GitHubClient(this.settings, this.noticeManager);
		if (this.gitHubClient.isReady()) {
			this.currentUser = await this.gitHubClient.fetchAuthenticatedUser();
		}

		this.fileManager = new FileManager(
			this.app,
			this.settings,
			this.noticeManager,
			this.gitHubClient,
		);

		if (this.settings.syncOnStartup && this.gitHubClient?.isReady()) {
			new Promise((resolve) => setTimeout(resolve, 750)).then(
				async () => {
					await this.sync();
				},
			);
		}
		const ribbonIconEl = this.addRibbonIcon(
			"refresh-cw",
			"GitHub",
			async (evt: MouseEvent) => {
				if (!this.gitHubClient?.isReady()) {
					new Notice(
						"Please set your GitHub token in settings first",
					);
					return;
				}
				await this.sync();
			},
		);
		ribbonIconEl.addClass("github-issues-ribbon-class");

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("GitHub");
		this.addCommand({
			id: "sync-issues-and-pull-requests",
			name: "Sync GitHub issues & pull requests",
			callback: () => this.sync(),
		});
		this.addSettingTab(new GitHubTrackerSettingTab(this.app, this));
		this.startBackgroundSync();
	}

	onunload() {
		this.stopBackgroundSync();
		this.gitHubClient?.dispose();
	}

	stopBackgroundSync(): void {
		if (this.backgroundSyncIntervalId !== null) {
			clearInterval(this.backgroundSyncIntervalId);
			this.backgroundSyncIntervalId = null;
			this.noticeManager.debug("Background sync stopped.");
		}
	}

	startBackgroundSync(): void {
		this.stopBackgroundSync();
		if (
			this.settings.enableBackgroundSync &&
			this.settings.backgroundSyncInterval > 0
		) {
			const intervalMillis =
				this.settings.backgroundSyncInterval * 60 * 1000;
			this.backgroundSyncIntervalId = window.setInterval(async () => {
				if (this.gitHubClient?.isReady()) {
					this.noticeManager.debug("Triggering background sync.");
					await this.sync();
				} else {
					this.noticeManager.debug(
						"Skipping background sync: GitHub client not ready or token not set.",
					);
				}
			}, intervalMillis);
			this.noticeManager.info(
				`Background sync scheduled every ${this.settings.backgroundSyncInterval} minutes.`,
			);
		}
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// Migrate existing repositories to include new custom folder properties
		this.settings.repositories = this.settings.repositories.map(repo => {
			return Object.assign({}, DEFAULT_REPOSITORY_TRACKING, repo);
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.settings.githubToken) {
			this.gitHubClient?.initializeClient();
		}
		if (this.noticeManager) {
			this.noticeManager = new NoticeManager(this.settings);
		}
		this.startBackgroundSync();
	}

	/**
	 * Fetch available repositories from GitHub
	 */
	async fetchAvailableRepositories() {
		if (!this.gitHubClient) {
			this.noticeManager.error("GitHub client not initialized");
			return [];
		}

		if (!this.settings.githubToken) {
			this.noticeManager.error(
				"No GitHub token provided. Please add your GitHub token in the settings.",
			);
			return [];
		}

		try {
			await this.gitHubClient.initializeClient(this.settings.githubToken);

			if (!this.currentUser) {
				this.currentUser =
					await this.gitHubClient.fetchAuthenticatedUser();
			}

			return await this.gitHubClient.fetchAvailableRepositories();
		} catch (error: unknown) {
			this.noticeManager.error(
				"Error fetching available repositories",
				error,
			);
			return [];
		}
	}

	/**
	 * Fetch and process issues from GitHub
	 */
	private async fetchIssues() {
		if (!this.gitHubClient || !this.fileManager) {
			this.noticeManager.error(
				"GitHub client or file manager not initialized",
			);
			return;
		}

		try {
			for (const repo of this.settings.repositories) {
				if (!repo.trackIssues) continue;

				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				this.noticeManager.debug(
					`Fetching issues for ${repo.repository}`,
				);
				const allIssuesIncludingRecentlyClosed =
					await this.gitHubClient.fetchRepositoryIssues(
						owner,
						repoName,
						true,
						this.settings.cleanupClosedIssuesDays,
					);

				const openIssues = allIssuesIncludingRecentlyClosed.filter(
					(issue: { state: string }) => issue.state === "open",
				);

				const filteredIssues = this.fileManager.filterIssues(
					repo,
					openIssues,
				);

				this.noticeManager.debug(
					`Found ${allIssuesIncludingRecentlyClosed.length} total issues (${openIssues.length} open), ${filteredIssues.length} match filters for file creation/update`,
				);
				const currentIssueNumbers = new Set(
					filteredIssues.map((issue: { number: number }) =>
						issue.number.toString(),
					),
				);

				await this.fileManager.createIssueFiles(
					repo,
					filteredIssues,
					allIssuesIncludingRecentlyClosed,
					currentIssueNumbers,
				);

				this.noticeManager.debug(
					`Processed ${filteredIssues.length} open issues for ${repo.repository}`,
				);
			}
		} catch (error: unknown) {
			this.noticeManager.error("Error fetching GitHub issues", error);
		}
	}

	/**
	 * Fetch and process pull requests from GitHub
	 */
	private async fetchPullRequests() {
		if (!this.gitHubClient || !this.fileManager) {
			this.noticeManager.error(
				"GitHub client or file manager not initialized",
			);
			return;
		}

		try {
			for (const repo of this.settings.repositories) {
				if (!repo.trackPullRequest) continue;

				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				this.noticeManager.debug(
					`Fetching pull requests for ${repo.repository}`,
				);

				const allPullRequestsIncludingRecentlyClosed =
					await this.gitHubClient.fetchRepositoryPullRequests(
						owner,
						repoName,
						true,
						this.settings.cleanupClosedIssuesDays,
					);

				const openPullRequests =
					allPullRequestsIncludingRecentlyClosed.filter(
						(pr: { state: string }) => pr.state === "open",
					);

				const filteredPRs = this.fileManager.filterPullRequests(
					repo,
					openPullRequests,
				);

				this.noticeManager.debug(
					`Found ${allPullRequestsIncludingRecentlyClosed.length} total pull requests (${openPullRequests.length} open), ${filteredPRs.length} match filters for file creation/update`,
				);

				const currentPRNumbers = new Set(
					filteredPRs.map((pr: { number: number }) =>
						pr.number.toString(),
					),
				);

				await this.fileManager.createPullRequestFiles(
					repo,
					filteredPRs,
					allPullRequestsIncludingRecentlyClosed,
					currentPRNumbers,
				);

				this.noticeManager.debug(
					`Processed ${filteredPRs.length} open pull requests for ${repo.repository}`,
				);
			}
		} catch (error: unknown) {
			this.noticeManager.error(
				"Error fetching GitHub pull requests",
				error,
			);
		}
	}

	public showNotice(
		message: string,
		type: "info" | "warning" | "error" | "success" | "debug" = "info",
	): void {
		if (!this.noticeManager) {
			new Notice(message);
			return;
		}

		switch (type) {
			case "info":
				this.noticeManager.info(message);
				break;
			case "warning":
				this.noticeManager.warning(message);
				break;
			case "error":
				this.noticeManager.error(message);
				break;
			case "success":
				this.noticeManager.success(message);
				break;
			case "debug":
				this.noticeManager.debug(message);
				break;
			default:
				this.noticeManager.info(message);
				break;
		}
	}
}

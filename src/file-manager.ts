import { App, TFile, TFolder } from "obsidian";
import { format } from "date-fns";
import { GitHubTrackerSettings, RepositoryTracking } from "./types";
import { escapeBody, escapeYamlString } from "./util/escapeUtils";
import { extractProperties, updateProperties } from "./util/properties";
import { NoticeManager } from "./notice-manager";
import { GitHubClient } from "./github-client";
import {
	processTemplate,
	createIssueTemplateData,
	createPullRequestTemplateData,
	processFilenameTemplate,
	processContentTemplate,
	extractNumberFromFilename
} from "./util/templateUtils";
import { getEffectiveRepoSettings } from "./util/settingsUtils";
import { extractPersistBlocks, mergePersistBlocks, shouldUpdateContent } from "./util/persistUtils";

export class FileManager {
	constructor(
		private app: App,
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
		private gitHubClient: GitHubClient,
	) {}

	/**
	 * Load template content from a file
	 */
	private async loadTemplateContent(templatePath: string): Promise<string | null> {
		if (!templatePath || templatePath.trim() === "") {
			return null;
		}

		try {
			const templateFile = this.app.vault.getAbstractFileByPath(templatePath.trim());
			if (templateFile instanceof TFile) {
				return await this.app.vault.read(templateFile);
			}
		} catch (error) {
			this.noticeManager.warning(`Could not load template file: ${templatePath}`);
		}
		return null;
	}

	/**
	 * Create issue files for a repository
	 */
	public async createIssueFiles(
		repo: RepositoryTracking,
		openIssues: any[],
		allIssuesIncludingRecentlyClosed: any[],
		_currentIssueNumbers: Set<string>,
	): Promise<void> {
		// Apply global defaults to repository settings
		const effectiveRepo = getEffectiveRepoSettings(repo, this.settings.globalDefaults);

		const [owner, repoName] = effectiveRepo.repository.split("/");
		if (!owner || !repoName) return;
		const repoCleaned = repoName.replace(/\//g, "-");
		const ownerCleaned = owner.replace(/\//g, "-");
		await this.cleanupDeletedIssues(
			effectiveRepo,
			ownerCleaned,
			repoCleaned,
			allIssuesIncludingRecentlyClosed,
		);

		// Create or update issue files for open issues
		for (const issue of openIssues) {
			await this.createOrUpdateIssueFile(
				effectiveRepo,
				ownerCleaned,
				repoCleaned,
				issue,
			);
		}
	}

	/**
	 * Create pull request files for a repository
	 */
	public async createPullRequestFiles(
		repo: RepositoryTracking,
		openPullRequests: any[],
		allPullRequestsIncludingRecentlyClosed: any[],
		_currentPRNumbers: Set<string>,
	): Promise<void> {
		// Apply global defaults to repository settings
		const effectiveRepo = getEffectiveRepoSettings(repo, this.settings.globalDefaults);

		const [owner, repoName] = effectiveRepo.repository.split("/");
		if (!owner || !repoName) return;

		const repoCleaned = repoName.replace(/\//g, "-");
		const ownerCleaned = owner.replace(/\//g, "-");

		await this.cleanupDeletedPullRequests(
			effectiveRepo,
			ownerCleaned,
			repoCleaned,
			allPullRequestsIncludingRecentlyClosed,
		);

		for (const pr of openPullRequests) {
			await this.createOrUpdatePullRequestFile(
				effectiveRepo,
				ownerCleaned,
				repoCleaned,
				pr,
			);
		}
	}

	public filterIssues(repo: RepositoryTracking, issues: any[]): any[] {
		let filteredIssues = issues;

		// Apply label filtering
		if ((repo.enableLabelFilter ?? false) && (repo.labelFilters?.length ?? 0) > 0) {
			filteredIssues = this.applyLabelFilter(filteredIssues, repo.labelFilterMode ?? "include", repo.labelFilters ?? []);
		}

		// Apply assignee filtering
		if ((repo.enableAssigneeFilter ?? false)) {
			filteredIssues = this.applyAssigneeFilter(filteredIssues, repo.assigneeFilterMode ?? "assigned-to-me", repo.assigneeFilters ?? []);
		}

		return filteredIssues;
	}

	private applyLabelFilter(items: any[], filterMode: "include" | "exclude", labelFilters: string[]): any[] {
		return items.filter((item) => {
			if (!item.labels || !Array.isArray(item.labels)) {
				// If no labels, only include in "exclude" mode (since we're excluding specific labels)
				return filterMode === "exclude";
			}

			const itemLabels = item.labels.map((label: any) =>
				typeof label === 'string' ? label : label.name
			);

			const hasMatchingLabel = labelFilters.some(filterLabel =>
				itemLabels.includes(filterLabel)
			);

			// Include mode: only include items that have at least one of the specified labels
			// Exclude mode: exclude items that have any of the specified labels
			return filterMode === "include" ? hasMatchingLabel : !hasMatchingLabel;
		});
	}

	private applyAssigneeFilter(items: any[], filterMode: "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned", assigneeFilters: string[]): any[] {
		return items.filter((item) => {
			const assignees = item.assignees || [];
			const assigneeUsernames = assignees.map((assignee: any) => assignee.login || assignee);

			switch (filterMode) {
				case "assigned-to-me":
					// Get current user from the item's context or use a stored current user
					const currentUser = this.getCurrentUser();
					return assigneeUsernames.includes(currentUser);

				case "assigned-to-specific":
					// Check if any of the specified assignees are assigned
					return assigneeFilters.some(filterUser => assigneeUsernames.includes(filterUser));

				case "unassigned":
					// Only include items with no assignees
					return assigneeUsernames.length === 0;

				case "any-assigned":
					// Only include items that have at least one assignee
					return assigneeUsernames.length > 0;

				default:
					return true;
			}
		});
	}

	private getCurrentUser(): string {
		// Access the current user from the GitHubClient through the main plugin
		return this.gitHubClient ? this.gitHubClient.getCurrentUser() : "";
	}

	public filterPullRequests(
		repo: RepositoryTracking,
		pullRequests: any[],
	): any[] {
		let filteredPullRequests = pullRequests;

		// Apply label filtering
		if ((repo.enablePrLabelFilter ?? false) && (repo.prLabelFilters?.length ?? 0) > 0) {
			filteredPullRequests = this.applyLabelFilter(filteredPullRequests, repo.prLabelFilterMode ?? "include", repo.prLabelFilters ?? []);
		}

		// Apply assignee filtering
		if ((repo.enablePrAssigneeFilter ?? false)) {
			filteredPullRequests = this.applyAssigneeFilter(filteredPullRequests, repo.prAssigneeFilterMode ?? "assigned-to-me", repo.prAssigneeFilters ?? []);
		}

		return filteredPullRequests;
	}

	public async cleanupEmptyFolders(): Promise<void> {
		try {
			for (const repo of this.settings.repositories) {
				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const repoCleaned = repoName.replace(/\//g, "-");
				const ownerCleaned = owner.replace(/\//g, "-");
				const issueFolder = this.getIssueFolderPath(repo, ownerCleaned, repoCleaned);
				const pullRequestFolder = this.getPullRequestFolderPath(repo, ownerCleaned, repoCleaned);

				await this.cleanupEmptyIssueFolder(
					repo,
					issueFolder,
					ownerCleaned,
				);
				await this.cleanupEmptyPullRequestFolder(
					repo,
					pullRequestFolder,
					ownerCleaned,
				);
			}
		} catch (error: unknown) {
			this.noticeManager.error("Error cleaning up empty folders", error);
		}
	}

	// ----- Private helper methods -----

	/**
	 * Get the issue folder path for a repository
	 */
	private getIssueFolderPath(repo: RepositoryTracking, ownerCleaned: string, repoCleaned: string): string {
		if (repo.useCustomIssueFolder && repo.customIssueFolder && repo.customIssueFolder.trim()) {
			return repo.customIssueFolder.trim();
		}
		return `${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`;
	}

	/**
	 * Get the pull request folder path for a repository
	 */
	private getPullRequestFolderPath(repo: RepositoryTracking, ownerCleaned: string, repoCleaned: string): string {
		if (repo.useCustomPullRequestFolder && repo.customPullRequestFolder && repo.customPullRequestFolder.trim()) {
			return repo.customPullRequestFolder.trim();
		}
		return `${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`;
	}

	private async cleanupDeletedIssues(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		allIssuesIncludingRecentlyClosed: any[],
	): Promise<void> {
		const issueFolderPath = this.getIssueFolderPath(repo, ownerCleaned, repoCleaned);
		const repoFolder = this.app.vault.getAbstractFileByPath(issueFolderPath);

		if (repoFolder) {
			const files = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.path.startsWith(`${issueFolderPath}/`) && file.extension === "md",
				);

			for (const file of files) {
				// Try to get number from frontmatter first (most reliable)
				const properties = extractProperties(this.app, file);
				let fileNumberString: string | null = null;

				if (properties.number) {
					fileNumberString = properties.number.toString();
				} else {
					// Fallback: try to extract from filename
					fileNumberString = extractNumberFromFilename(
						file.name,
						repo.issueNoteTemplate || "Issue - {number}"
					);
				}

				if (!fileNumberString) {
					// If we can't determine the issue number, log a warning but skip
					this.noticeManager.debug(
						`Could not determine issue number for file: ${file.name}. Consider adding a 'number' property to the frontmatter.`
					);
					continue;
				}

				const correspondingIssue =
					allIssuesIncludingRecentlyClosed.find(
						(issue: any) =>
							issue.number.toString() === fileNumberString,
					);

				let shouldDelete = false;
				let deleteReason = "";

				if (correspondingIssue) {
					if (correspondingIssue.state === "closed" && correspondingIssue.closed_at) {
						// Check if issue has been closed longer than the configured days
						const closedDate = new Date(correspondingIssue.closed_at);
						const cutoffDate = new Date();
						cutoffDate.setDate(cutoffDate.getDate() - this.settings.cleanupClosedIssuesDays);

						if (closedDate < cutoffDate) {
							shouldDelete = true;
							const daysClosed = Math.floor((Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
							deleteReason = `Deleted issue ${fileNumberString} from ${repo.repository} (closed ${daysClosed} days ago, threshold: ${this.settings.cleanupClosedIssuesDays} days)`;
						}
					}
				} else {
					shouldDelete = true;
					deleteReason = `Deleted issue ${fileNumberString} from ${repo.repository} as it's no longer tracked (closed > ${this.settings.cleanupClosedIssuesDays} days or deleted)`;
				}				if (shouldDelete) {
					const allowDelete = properties.allowDelete
					? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
					: repo.allowDeleteIssue;

					if (allowDelete) {
						await this.app.fileManager.trashFile(file);
						this.noticeManager.info(deleteReason);
					}
				}
			}
		}
	}

	private async cleanupDeletedPullRequests(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		allPullRequestsIncludingRecentlyClosed: any[],
	): Promise<void> {
		const pullRequestFolderPath = this.getPullRequestFolderPath(repo, ownerCleaned, repoCleaned);
		const repoFolder = this.app.vault.getAbstractFileByPath(pullRequestFolderPath);

		if (repoFolder) {
			const files = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.path.startsWith(`${pullRequestFolderPath}/`) && file.extension === "md",
				);

			for (const file of files) {
				// Try to get number from frontmatter first (most reliable)
				const properties = extractProperties(this.app, file);
				let fileNumberString: string | null = null;

				if (properties.number) {
					fileNumberString = properties.number.toString();
				} else {
					// Fallback: try to extract from filename
					fileNumberString = extractNumberFromFilename(
						file.name,
						repo.pullRequestNoteTemplate || "Pull Request - {number}"
					);
				}

				if (!fileNumberString) {
					// If we can't determine the PR number, log a warning but skip
					this.noticeManager.debug(
						`Could not determine PR number for file: ${file.name}. Consider adding a 'number' property to the frontmatter.`
					);
					continue;
				}

				const correspondingPR =
					allPullRequestsIncludingRecentlyClosed.find(
						(pr: any) => pr.number.toString() === fileNumberString,
					);

				let shouldDelete = false;
				let deleteReason = "";

				if (correspondingPR) {
					if (correspondingPR.state === "closed" && correspondingPR.closed_at) {
						// Check if PR has been closed longer than the configured days
						const closedDate = new Date(correspondingPR.closed_at);
						const cutoffDate = new Date();
						cutoffDate.setDate(cutoffDate.getDate() - this.settings.cleanupClosedIssuesDays);

						if (closedDate < cutoffDate) {
							shouldDelete = true;
							const daysClosed = Math.floor((Date.now() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
							deleteReason = `Deleted pull request ${fileNumberString} from ${repo.repository} (closed ${daysClosed} days ago, threshold: ${this.settings.cleanupClosedIssuesDays} days)`;
						}
					}
				} else {
					shouldDelete = true;
					deleteReason = `Deleted pull request ${fileNumberString} from ${repo.repository} as it's no longer tracked (closed > ${this.settings.cleanupClosedIssuesDays} days or deleted)`;
				}			if (shouldDelete) {
					const allowDelete = properties.allowDelete
					? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
					: repo.allowDeletePullRequest;

					if (allowDelete) {
						await this.app.fileManager.trashFile(file);
						this.noticeManager.info(deleteReason);
					}
				}
			}
		}
	}

	private async createOrUpdateIssueFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		issue: any,
	): Promise<void> {
		// Generate filename using template
		const templateData = createIssueTemplateData(issue, repo.repository);
		const baseFileName = processFilenameTemplate(
			repo.issueNoteTemplate || "Issue - {number}",
			templateData,
			this.settings.dateFormat
		);
		const fileName = `${baseFileName}.md`;
		const issueFolderPath = this.getIssueFolderPath(repo, ownerCleaned, repoCleaned);

		// Ensure folder structure exists
		if (repo.useCustomIssueFolder && repo.customIssueFolder && repo.customIssueFolder.trim()) {
			// For custom folders, just ensure the custom path exists
			await this.ensureFolderExists(repo.customIssueFolder.trim());
		} else {
			// For default structure, ensure nested path exists
			await this.ensureFolderExists(repo.issueFolder);
			await this.ensureFolderExists(`${repo.issueFolder}/${ownerCleaned}`);
			await this.ensureFolderExists(`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`);
		}

		const file = this.app.vault.getAbstractFileByPath(`${issueFolderPath}/${fileName}`);

		const [owner, repoName] = repo.repository.split("/");

		// Only fetch comments if they should be included
		let comments: any[] = [];
		if (repo.includeIssueComments) {
			comments = await this.gitHubClient.fetchIssueComments(
				owner,
				repoName,
				issue.number,
			);
		} else {
			this.noticeManager.debug(
				`Skipping comments for issue ${issue.number}: repository setting disabled`,
			);
		}

		let content = await this.createIssueContent(issue, repo, comments);

		if (file) {
			if (file instanceof TFile) {
				// Use current repository updateMode setting (not the old value from file properties)
				const updateMode = repo.issueUpdateMode;

				if (updateMode === "update") {
					// Read existing content first
					const existingContent = await this.app.vault.read(file);

					// Check if content needs updating based on updated_at field
					if (!shouldUpdateContent(existingContent, issue.updated_at)) {
						this.noticeManager.debug(
							`Skipped update for issue ${issue.number}: no changes detected (updated_at match)`
						);
						return;
					}

					// Extract persist blocks from existing content
					const persistBlocks = extractPersistBlocks(existingContent);

					// Create the complete new content with updated frontmatter
					let updatedContent = await this.createIssueContent(
						issue,
						repo,
						comments,
					);

					// Merge persist blocks back into new content
					if (persistBlocks.size > 0) {
						updatedContent = mergePersistBlocks(updatedContent, existingContent, persistBlocks);
						this.noticeManager.debug(
							`Restored ${persistBlocks.size} persist block(s) for issue ${issue.number}`
						);
					}

					await this.app.vault.modify(file, updatedContent);
					this.noticeManager.debug(`Updated issue ${issue.number}`);
				} else if (updateMode === "append") {
					content = `---\n### New status: "${
						issue.state
					}"\n\n# ${escapeBody(
						issue.title,
						this.settings.escapeMode,
					)}\n${
						issue.body
							? escapeBody(issue.body, this.settings.escapeMode)
							: "No description found"
					}\n`;

					if (comments.length > 0) {
						content += this.formatComments(
							comments,
							this.settings.escapeMode,
						);
					}
					const currentFileContent = await this.app.vault.read(file);
					const newContent = currentFileContent + "\n\n" + content;
					await this.app.vault.modify(file, newContent);
					this.noticeManager.debug(
						`Appended content to issue ${issue.number}`,
					);
				} else {
					this.noticeManager.debug(
						`Skipped update for issue ${issue.number} (mode: ${updateMode})`,
					);
				}
			}
		} else {
			await this.app.vault.create(`${issueFolderPath}/${fileName}`, content);
			this.noticeManager.debug(`Created issue file for ${issue.number}`);
		}
	}

	private async createOrUpdatePullRequestFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		pr: any,
	): Promise<void> {
		// Generate filename using template
		const templateData = createPullRequestTemplateData(pr, repo.repository);
		const baseFileName = processFilenameTemplate(
			repo.pullRequestNoteTemplate || "PR - {number}",
			templateData,
			this.settings.dateFormat
		);
		const fileName = `${baseFileName}.md`;
		const pullRequestFolderPath = this.getPullRequestFolderPath(repo, ownerCleaned, repoCleaned);

		// Ensure folder structure exists
		if (repo.useCustomPullRequestFolder && repo.customPullRequestFolder && repo.customPullRequestFolder.trim()) {
			// For custom folders, just ensure the custom path exists
			await this.ensureFolderExists(repo.customPullRequestFolder.trim());
		} else {
			// For default structure, ensure nested path exists
			await this.ensureFolderExists(repo.pullRequestFolder);
			await this.ensureFolderExists(`${repo.pullRequestFolder}/${ownerCleaned}`);
			await this.ensureFolderExists(`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`);
		}

		const file = this.app.vault.getAbstractFileByPath(`${pullRequestFolderPath}/${fileName}`);

		const [owner, repoName] = repo.repository.split("/");

		// Only fetch comments if they should be included
		let comments: any[] = [];
		if (repo.includePullRequestComments) {
			comments = await this.gitHubClient.fetchPullRequestComments(
				owner,
				repoName,
				pr.number,
			);
		} else {
			this.noticeManager.debug(
				`Skipping comments for PR ${pr.number}: repository setting disabled`,
			);
		}

		let content = await this.createPullRequestContent(pr, repo, comments);

		if (file) {
			if (file instanceof TFile) {
				// Use current repository updateMode setting (not the old value from file properties)
				const updateMode = repo.pullRequestUpdateMode;

				if (updateMode === "update") {
					// Read existing content first
					const existingContent = await this.app.vault.read(file);

					// Check if content needs updating based on updated_at field
					if (!shouldUpdateContent(existingContent, pr.updated_at)) {
						this.noticeManager.debug(
							`Skipped update for PR ${pr.number}: no changes detected (updated_at match)`
						);
						return;
					}

					// Extract persist blocks from existing content
					const persistBlocks = extractPersistBlocks(existingContent);

					// Create the complete new content with updated frontmatter
					let updatedContent = await this.createPullRequestContent(
						pr,
						repo,
						comments,
					);

					// Merge persist blocks back into new content
					if (persistBlocks.size > 0) {
						updatedContent = mergePersistBlocks(updatedContent, existingContent, persistBlocks);
						this.noticeManager.debug(
							`Restored ${persistBlocks.size} persist block(s) for PR ${pr.number}`
						);
					}

					await this.app.vault.modify(file, updatedContent);
					this.noticeManager.debug(`Updated PR ${pr.number}`);
				} else if (updateMode === "append") {
					content = `---\n### New status: "${
						pr.state
					}"\n\n# ${escapeBody(
						pr.title,
						this.settings.escapeMode,
					)}\n${
						pr.body
							? escapeBody(pr.body, this.settings.escapeMode)
							: "No description found"
					}\n`;
					if (comments.length > 0) {
						content += this.formatComments(
							comments,
							this.settings.escapeMode,
						);
					}

					const currentFileContent = await this.app.vault.read(file);
					const newContent = currentFileContent + "\n\n" + content;
					await this.app.vault.modify(file, newContent);
					this.noticeManager.debug(
						`Appended content to PR ${pr.number}`,
					);
				} else {
					this.noticeManager.debug(
						`Skipped update for PR ${pr.number} (mode: ${updateMode})`,
					);
				}
			}
		} else {
			await this.app.vault.create(`${pullRequestFolderPath}/${fileName}`, content);
			this.noticeManager.debug(`Created PR file for ${pr.number}`);
		}
	}

	private async ensureFolderExists(path: string): Promise<void> {
		// Guard against undefined or empty paths
		if (!path || path.trim() === "") {
			this.noticeManager.error("Cannot create folder: path is empty or undefined");
			return;
		}

		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			try {
				await this.app.vault.createFolder(path);
				this.noticeManager.debug(`Created folder: ${path}`);
			} catch (error) {
				// If creation is failed create again to ensure folder exists
				await this.app.vault.createFolder(path);
			}
		}
	}

	private async createIssueContent(
		issue: any,
		repo: RepositoryTracking,
		comments: any[],
	): Promise<string> {
		// Check if custom template is enabled and load template content
		if (repo.useCustomIssueContentTemplate && repo.issueContentTemplate) {
			const templateContent = await this.loadTemplateContent(repo.issueContentTemplate);
			if (templateContent) {
				const templateData = createIssueTemplateData(
					issue,
					repo.repository,
					comments,
					this.settings.dateFormat,
					this.settings.escapeMode
				);
				return processContentTemplate(templateContent, templateData, this.settings.dateFormat);
			}
		}

		// Fallback to default template
		return `---
title: "${escapeYamlString(issue.title)}"
number: ${issue.number}
status: "${issue.state}"
created: "${
			this.settings.dateFormat !== ""
				? format(new Date(issue.created_at), this.settings.dateFormat)
				: new Date(issue.created_at).toLocaleString()
		}"
updated: "${
			this.settings.dateFormat !== ""
				? format(new Date(issue.updated_at), this.settings.dateFormat)
				: new Date(issue.updated_at).toLocaleString()
		}"
url: "${issue.html_url}"
opened_by: "${issue.user?.login}"
assignees: [${(
			issue.assignees?.map(
				(assignee: { login: string }) => '"' + assignee.login + '"',
			) || []
		).join(", ")}]
labels: [${(
			issue.labels?.map(
				(label: { name: string }) => '"' + label.name + '"',
			) || []
		).join(", ")}]
updateMode: "${repo.issueUpdateMode}"
allowDelete: ${repo.allowDeleteIssue ? true : false}
---

# ${escapeBody(issue.title, this.settings.escapeMode)}
${
	issue.body
		? escapeBody(issue.body, this.settings.escapeMode)
		: "No description found"
}

${this.formatComments(comments, this.settings.escapeMode)}
`;
	}

	private async createPullRequestContent(
		pr: any,
		repo: RepositoryTracking,
		comments: any[],
	): Promise<string> {
		// Check if custom template is enabled and load template content
		if (repo.useCustomPullRequestContentTemplate && repo.pullRequestContentTemplate) {
			const templateContent = await this.loadTemplateContent(repo.pullRequestContentTemplate);
			if (templateContent) {
				const templateData = createPullRequestTemplateData(
					pr,
					repo.repository,
					comments,
					this.settings.dateFormat,
					this.settings.escapeMode
				);
				return processContentTemplate(templateContent, templateData, this.settings.dateFormat);
			}
		}

		// Fallback to default template
		return `---
title: "${escapeYamlString(pr.title)}"
number: ${pr.number}
status: "${pr.state}"
created: "${
			this.settings.dateFormat !== ""
				? format(new Date(pr.created_at), this.settings.dateFormat)
				: new Date(pr.created_at).toLocaleString()
		}"
updated: "${
			this.settings.dateFormat !== ""
				? format(new Date(pr.updated_at), this.settings.dateFormat)
				: new Date(pr.updated_at).toLocaleString()
		}"
url: "${pr.html_url}"
opened_by: "${pr.user?.login}"
assignees: [${(
			pr.assignees?.map(
				(assignee: { login: string }) => '"' + assignee.login + '"',
			) || []
		).join(", ")}]
requested_reviewers: [${(
			pr.requested_reviewers?.map(
				(reviewer: { login: string }) => '"' + reviewer.login + '"',
			) || []
		).join(", ")}]
labels: [${(
			pr.labels?.map(
				(label: { name: string }) => '"' + label.name + '"',
			) || []
		).join(", ")}]
updateMode: "${repo.pullRequestUpdateMode}"
allowDelete: ${repo.allowDeletePullRequest ? true : false}
---

# ${escapeBody(pr.title, this.settings.escapeMode)}
${
	pr.body
		? escapeBody(pr.body, this.settings.escapeMode)
		: "No description found"
}

${this.formatComments(comments, this.settings.escapeMode)}
`;
	}

	private async cleanupEmptyIssueFolder(
		repo: RepositoryTracking,
		issueFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		const issueFolderContent =
			this.app.vault.getAbstractFileByPath(issueFolder);

		if (issueFolderContent instanceof TFolder) {
			const files = issueFolderContent.children;

			if (!repo.trackIssues) {
				for (const file of files) {
					if (file instanceof TFile) {
						// Use Obsidian's MetadataCache to get frontmatter
						const properties = extractProperties(this.app, file);
						const allowDelete = properties.allowDelete
						? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
						: false;

						if (allowDelete) {
							await this.app.fileManager.trashFile(file);
							this.noticeManager.debug(
								`Deleted file ${file.name} from untracked repo`,
							);
							files.splice(files.indexOf(file), 1);
						}
					}
				}
			}

			// Only cleanup nested folder structure if not using custom folder
			if (!repo.useCustomIssueFolder || !repo.customIssueFolder || !repo.customIssueFolder.trim()) {
				if (files.length === 0) {
					this.noticeManager.info(
						`Deleting empty folder: ${issueFolder}`,
					);
					const folder =
						this.app.vault.getAbstractFileByPath(issueFolder);
					if (folder instanceof TFolder && folder.children.length === 0) {
						await this.app.fileManager.trashFile(folder);
					}
				}

				const issueOwnerFolder = this.app.vault.getAbstractFileByPath(
					`${repo.issueFolder}/${ownerCleaned}`,
				);

				if (issueOwnerFolder instanceof TFolder) {
					const files = issueOwnerFolder.children;
					if (files.length === 0) {
						this.noticeManager.info(
							`Deleting empty folder: ${issueOwnerFolder.path}`,
						);
						await this.app.fileManager.trashFile(issueOwnerFolder);
					}
				}
			}
		}
	}

	private async cleanupEmptyPullRequestFolder(
		repo: RepositoryTracking,
		pullRequestFolder: string,
		ownerCleaned: string,
	): Promise<void> {
		const pullRequestFolderContent =
			this.app.vault.getAbstractFileByPath(pullRequestFolder);

		if (pullRequestFolderContent instanceof TFolder) {
			const files = pullRequestFolderContent.children;

			if (!repo.trackPullRequest) {
				for (const file of files) {
					if (file instanceof TFile) {
						// Use Obsidian's MetadataCache to get frontmatter
						const properties = extractProperties(this.app, file);
						const allowDelete = properties.allowDelete
						? String(properties.allowDelete)
							.toLowerCase()
							.replace('"', "") === "true"
						: false;

						if (allowDelete) {
							await this.app.fileManager.trashFile(file);
							this.noticeManager.debug(
								`Deleted file ${file.name} from untracked repo`,
							);
							files.splice(files.indexOf(file), 1);
						}
					}
				}
			}

			// Only cleanup nested folder structure if not using custom folder
			if (!repo.useCustomPullRequestFolder || !repo.customPullRequestFolder || !repo.customPullRequestFolder.trim()) {
				if (files.length === 0) {
					this.noticeManager.info(
						`Deleting empty folder: ${pullRequestFolder}`,
					);
					const folder =
						this.app.vault.getAbstractFileByPath(pullRequestFolder);
					if (folder instanceof TFolder && folder.children.length === 0) {
						await this.app.fileManager.trashFile(folder);
					}
				}

				const pullRequestOwnerFolder = this.app.vault.getAbstractFileByPath(
					`${repo.pullRequestFolder}/${ownerCleaned}`,
				);

				if (pullRequestOwnerFolder instanceof TFolder) {
					const files = pullRequestOwnerFolder.children;
					if (files.length === 0) {
						this.noticeManager.info(
							`Deleting empty folder: ${pullRequestOwnerFolder.path}`,
						);
						await this.app.fileManager.trashFile(
							pullRequestOwnerFolder,
						);
					}
				}
			}
		}
	}

	// Format comments section for issues and pull requests

	private formatComments(
		comments: any[],
		escapeMode: "disabled" | "normal" | "strict" | "veryStrict",
	): string {
		if (!comments || comments.length === 0) {
			return "";
		}

		comments.sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);

		let commentSection = "\n## Comments\n\n";

		comments.forEach((comment) => {
			const createdAt =
				this.settings.dateFormat !== ""
					? format(
							new Date(comment.created_at),
							this.settings.dateFormat,
						)
					: new Date(comment.created_at).toLocaleString();

			const username = comment.user?.login || "Unknown User";

			if (comment.is_review_comment) {
				commentSection += `### ${username} commented on line ${
					comment.line || "N/A"
				} of file \`${comment.path || "unknown"}\` (${createdAt}):\n\n`;
			} else {
				commentSection += `### ${username} commented (${createdAt}):\n\n`;
			}

			commentSection += `${escapeBody(
				comment.body || "No content",
				escapeMode,
			)}\n\n---\n\n`;
		});

		return commentSection;
	}
}

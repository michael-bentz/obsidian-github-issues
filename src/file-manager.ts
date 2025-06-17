import { App, TFile, TFolder } from "obsidian";
import { format } from "date-fns";
import { GitHubTrackerSettings, RepositoryTracking } from "./types";
import { escapeBody } from "./util/escapeUtils";
import { extractProperties, mapToProperties } from "./util/properties";
import { NoticeManager } from "./notice-manager";
import { GitHubClient } from "./github-client";

export class FileManager {
	constructor(
		private app: App,
		private settings: GitHubTrackerSettings,
		private noticeManager: NoticeManager,
		private gitHubClient: GitHubClient,
	) {}

	/**
	 * Create issue files for a repository
	 */
	public async createIssueFiles(
		repo: RepositoryTracking,
		openIssues: any[],
		allIssuesIncludingRecentlyClosed: any[],
		_currentIssueNumbers: Set<string>,
	): Promise<void> {
		const [owner, repoName] = repo.repository.split("/");
		if (!owner || !repoName) return;
		const repoCleaned = repoName.replace(/\//g, "-");
		const ownerCleaned = owner.replace(/\//g, "-");
		await this.cleanupDeletedIssues(
			repo,
			ownerCleaned,
			repoCleaned,
			allIssuesIncludingRecentlyClosed,
		);

		// Create or update issue files for open issues
		for (const issue of openIssues) {
			await this.createOrUpdateIssueFile(
				repo,
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
		const [owner, repoName] = repo.repository.split("/");
		if (!owner || !repoName) return;

		const repoCleaned = repoName.replace(/\//g, "-");
		const ownerCleaned = owner.replace(/\//g, "-");

		await this.cleanupDeletedPullRequests(
			repo,
			ownerCleaned,
			repoCleaned,
			allPullRequestsIncludingRecentlyClosed,
		);

		for (const pr of openPullRequests) {
			await this.createOrUpdatePullRequestFile(
				repo,
				ownerCleaned,
				repoCleaned,
				pr,
			);
		}
	}

	public filterIssues(repo: RepositoryTracking, issues: any[]): any[] {
		return issues;
	}

	public filterPullRequests(
		repo: RepositoryTracking,
		pullRequests: any[],
	): any[] {
		return pullRequests;
	}

	public async cleanupEmptyFolders(): Promise<void> {
		try {
			for (const repo of this.settings.repositories) {
				const [owner, repoName] = repo.repository.split("/");
				if (!owner || !repoName) continue;

				const repoCleaned = repoName.replace(/\//g, "-");
				const ownerCleaned = owner.replace(/\//g, "-");
				const issueFolder = `${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`;
				const pullRequestFolder = `${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`;

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

	private async cleanupDeletedIssues(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		allIssuesIncludingRecentlyClosed: any[],
	): Promise<void> {
		const repoFolder = this.app.vault.getAbstractFileByPath(
			`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`,
		);

		if (repoFolder) {
			const files = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.path.startsWith(
							`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}/`,
						) && file.extension === "md",
				);

			for (const file of files) {
				const fileNumberString = file.name
					.replace(".md", "")
					.replace("Issue - ", "");

				const correspondingIssue =
					allIssuesIncludingRecentlyClosed.find(
						(issue: any) =>
							issue.number.toString() === fileNumberString,
					);

				let shouldDelete = false;
				let deleteReason = "";

				if (correspondingIssue) {
					if (correspondingIssue.state === "closed") {
						shouldDelete = true;
						deleteReason = `Deleted closed issue ${fileNumberString} from ${repo.repository}`;
					}
				} else {
					shouldDelete = true;
					deleteReason = `Deleted issue ${fileNumberString} from ${repo.repository} as it's no longer tracked (closed > 30 days or deleted)`;
				}

				if (shouldDelete) {
					const fileContent = await this.app.vault.read(file);
					const properties = extractProperties(fileContent);
					const allowDelete = properties.allowDelete
						? properties.allowDelete
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
		const repoFolder = this.app.vault.getAbstractFileByPath(
			`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`,
		);

		if (repoFolder) {
			const files = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.path.startsWith(
							`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}/`,
						) && file.extension === "md",
				);

			for (const file of files) {
				const fileNumberString = file.name
					.replace(".md", "")
					.replace("Pull Request - ", "");
				const correspondingPR =
					allPullRequestsIncludingRecentlyClosed.find(
						(pr: any) => pr.number.toString() === fileNumberString,
					);

				let shouldDelete = false;
				let deleteReason = "";

				if (correspondingPR) {
					if (correspondingPR.state === "closed") {
						shouldDelete = true;
						deleteReason = `Deleted closed pull request ${fileNumberString} from ${repo.repository}`;
					}
				} else {
					shouldDelete = true;
					deleteReason = `Deleted pull request ${fileNumberString} from ${repo.repository} as it's no longer tracked (closed > 30 days or deleted)`;
				}

				if (shouldDelete) {
					const fileContent = await this.app.vault.read(file);
					const properties = extractProperties(fileContent);
					const allowDelete = properties.allowDelete
						? properties.allowDelete
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
		const fileName = `Issue - ${issue.number}.md`;
		await this.ensureFolderExists(repo.issueFolder);
		await this.ensureFolderExists(`${repo.issueFolder}/${ownerCleaned}`);
		await this.ensureFolderExists(
			`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}`,
		);

		const file = this.app.vault.getAbstractFileByPath(
			`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}/${fileName}`,
		);

		const [owner, repoName] = repo.repository.split("/");
		const comments = await this.gitHubClient.fetchIssueComments(
			owner,
			repoName,
			issue.number,
		);

		let content = this.createIssueContent(issue, repo, comments);

		if (file) {
			if (file instanceof TFile) {
				const fileContent = await this.app.vault.read(file);
				const properties = extractProperties(fileContent);
				properties.assignees =
					issue.assignees?.map((a: { login: string }) => a.login) ||
					[];

				const updateModeText = properties.updateMode;

				if (!updateModeText) {
					this.noticeManager.warning(
						`No valid update mode found for issue ${issue.number}. Using repository setting.`,
					);
				}

				const updateMode = updateModeText
					? updateModeText.toLowerCase().replace('"', "")
					: repo.issueUpdateMode;

				if (updateMode === "update") {
					content = `${mapToProperties(properties)}\n\n# ${escapeBody(
						issue.title,
						this.settings.escapeMode,
					)}\n${
						issue.body
							? escapeBody(issue.body, this.settings.escapeMode)
							: "No description found"
					}\n`;

					// Add comments section
					if (comments.length > 0) {
						content += this.formatComments(
							comments,
							this.settings.escapeMode,
						);
					}

					await this.app.vault.modify(file, content);
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
					const newContent = fileContent + "\n\n" + content;
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
			await this.app.vault.create(
				`${repo.issueFolder}/${ownerCleaned}/${repoCleaned}/${fileName}`,
				content,
			);
			this.noticeManager.debug(`Created issue file for ${issue.number}`);
		}
	}

	private async createOrUpdatePullRequestFile(
		repo: RepositoryTracking,
		ownerCleaned: string,
		repoCleaned: string,
		pr: any,
	): Promise<void> {
		const fileName = `Pull Request - ${pr.number}.md`;

		await this.ensureFolderExists(repo.pullRequestFolder);
		await this.ensureFolderExists(
			`${repo.pullRequestFolder}/${ownerCleaned}`,
		);
		await this.ensureFolderExists(
			`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}`,
		);

		const file = this.app.vault.getAbstractFileByPath(
			`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}/${fileName}`,
		);

		const [owner, repoName] = repo.repository.split("/");
		const comments = await this.gitHubClient.fetchPullRequestComments(
			owner,
			repoName,
			pr.number,
		);

		let content = this.createPullRequestContent(pr, repo, comments);

		if (file) {
			if (file instanceof TFile) {
				const fileContent = await this.app.vault.read(file);
				const properties = extractProperties(fileContent);
				properties.assignees =
					pr.assignees?.map((a: { login: string }) => a.login) || [];
				properties.requested_reviewers =
					pr.requested_reviewers?.map(
						(r: { login: string }) => r.login,
					) || [];

				const updateModeText = properties.updateMode;

				if (!updateModeText) {
					this.noticeManager.warning(
						`No valid update mode found for PR ${pr.number}. Using repository setting.`,
					);
				}

				const updateMode = updateModeText
					? updateModeText.toLowerCase().replace('"', "")
					: repo.pullRequestUpdateMode;

				if (updateMode === "update") {
					content = `${mapToProperties(properties)}\n\n# ${escapeBody(
						pr.title,
						this.settings.escapeMode,
					)}\n${
						pr.body
							? escapeBody(pr.body, this.settings.escapeMode)
							: "No description found"
					}\n`;

					// Add comments section
					if (comments.length > 0) {
						content += this.formatComments(
							comments,
							this.settings.escapeMode,
						);
					}

					await this.app.vault.modify(file, content);
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

					const newContent = fileContent + "\n\n" + content;
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
			await this.app.vault.create(
				`${repo.pullRequestFolder}/${ownerCleaned}/${repoCleaned}/${fileName}`,
				content,
			);
			this.noticeManager.debug(`Created PR file for ${pr.number}`);
		}
	}

	private async ensureFolderExists(path: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			await this.app.vault.createFolder(path);
			this.noticeManager.debug(`Created folder: ${path}`);
		}
	}

	private createIssueContent(
		issue: any,
		repo: RepositoryTracking,
		comments: any[],
	): string {
		return `---
			title: "${escapeBody(issue.title, this.settings.escapeMode)}"
			status: "${issue.state}"
			created: "${
				this.settings.dateFormat !== ""
					? format(
							new Date(issue.created_at),
							this.settings.dateFormat,
						)
					: new Date(issue.created_at).toLocaleString()
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

	private createPullRequestContent(
		pr: any,
		repo: RepositoryTracking,
		comments: any[],
	): string {
		return `---
title: "${escapeBody(pr.title, this.settings.escapeMode)}"
status: "${pr.state}"
created: "${
			this.settings.dateFormat !== ""
				? format(new Date(pr.created_at), this.settings.dateFormat)
				: new Date(pr.created_at).toLocaleString()
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
						// Read the file properties
						const fileContent = await this.app.vault.read(file);
						const properties = extractProperties(fileContent);
						const allowDelete = properties.allowDelete
							? properties.allowDelete
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

			if (files.length === 0) {
				this.noticeManager.info(
					`Deleting empty folder: ${issueFolder}`,
				);
				const folder =
					this.app.vault.getAbstractFileByPath(issueFolder);
				if (folder instanceof TFolder && folder.children.length === 0) {
					await this.app.vault.delete(folder, true);
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
					await this.app.vault.delete(issueOwnerFolder, true);
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
						const fileContent = await this.app.vault.read(file);
						const properties = extractProperties(fileContent);
						const allowDelete = properties.allowDelete
							? properties.allowDelete
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

			if (files.length === 0) {
				this.noticeManager.info(
					`Deleting empty folder: ${pullRequestFolder}`,
				);
				const folder =
					this.app.vault.getAbstractFileByPath(pullRequestFolder);
				if (folder instanceof TFolder && folder.children.length === 0) {
					await this.app.vault.delete(folder, true);
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
					await this.app.vault.delete(pullRequestOwnerFolder, true);
				}
			}
		}
	}

	/**
	 * Format comments section for issues and pull requests
	 */
	private formatComments(
		comments: any[],
		escapeMode: "disabled" | "normal" | "strict" | "veryStrict",
	): string {
		if (!comments || comments.length === 0) {
			return "";
		}

		comments.sort(
			(a, b) =>
				new Date(a.created_at).getTime() -
				new Date(b.created_at).getTime(),
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

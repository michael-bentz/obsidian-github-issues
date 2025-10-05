import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	setIcon,
	TextComponent,
	TFolder,
	AbstractInputSuggest,
	TAbstractFile,
} from "obsidian";
import { RepositoryTracking, DEFAULT_REPOSITORY_TRACKING } from "./types";
import GitHubTrackerPlugin from "./main";
import { getTemplateHelp } from "./util/templateUtils";

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputElement: HTMLInputElement;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
		this.inputElement = inputEl;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		abstractFiles.forEach((folder: TAbstractFile) => {
			if (
				folder instanceof TFolder &&
				folder.path.toLowerCase().contains(lowerCaseInputStr)
			) {
				folders.push(folder);
			}
		});

		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		try {
			if (this.inputElement) {
				this.inputElement.value = folder.path;
				// Trigger input event to notify onChange handlers
				const event = new Event('input', { bubbles: true });
				this.inputElement.dispatchEvent(event);
				this.close();
			} else {
				console.error('FolderSuggest: Input element is not available');
			}
		} catch (error) {
			console.error('FolderSuggest: Error setting folder value:', error);
		}
	}
}

class FileSuggest extends AbstractInputSuggest<TAbstractFile> {
	private inputElement: HTMLInputElement;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
		this.inputElement = inputEl;
	}

	getSuggestions(inputStr: string): TAbstractFile[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const files: TAbstractFile[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		abstractFiles.forEach((file: TAbstractFile) => {
			if (
				file.path.endsWith('.md') &&
				file.path.toLowerCase().contains(lowerCaseInputStr)
			) {
				files.push(file);
			}
		});

		return files;
	}

	renderSuggestion(file: TAbstractFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TAbstractFile): void {
		try {
			if (this.inputElement) {
				this.inputElement.value = file.path;
				// Trigger input event to notify onChange handlers
				const event = new Event('input', { bubbles: true });
				this.inputElement.dispatchEvent(event);
				this.close();
			} else {
				console.error('FileSuggest: Input element is not available');
			}
		} catch (error) {
			console.error('FileSuggest: Error setting file value:', error);
		}
	}
}

export class GitHubTrackerSettingTab extends PluginSettingTab {
	private selectedRepositories: Set<string> = new Set();

	constructor(
		app: App,
		private plugin: GitHubTrackerPlugin,
	) {
		super(app, plugin);
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass("github-issues");

		// Header
		const headerEl = containerEl.createEl("div", { cls: "github-issues-settings-header" });
		headerEl.createEl("h2", { text: "GitHub Issues & Pull Requests" });

		const subtitleContainer = headerEl.createDiv({ cls: "github-issues-settings-subtitle" });
		subtitleContainer.createSpan({ text: "Sync your GitHub issues and pull requests in Obsidian" });

		const linksContainer = subtitleContainer.createDiv({ cls: "github-issues-subtitle-links" });

		const bugLink = linksContainer.createEl("a", {
			href: "https://github.com/LonoxX/obsidian-github-issues/issues/new",
			cls: "github-issues-bug-link",
		});
		bugLink.setAttribute("target", "_blank");
		const bugIcon = bugLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(bugIcon, "bug");
		bugLink.createSpan({ text: "Report Bug" });

		linksContainer.createSpan({ text: " • " });

		const sponsorLink = linksContainer.createEl("a", {
			href: "https://github.com/sponsors/LonoxX",
			cls: "github-issues-sponsor-link",
		});
		sponsorLink.setAttribute("target", "_blank");
		const sponsorIcon = sponsorLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(sponsorIcon, "heart");
		sponsorLink.createSpan({ text: "Support me" });

		linksContainer.createSpan({ text: " • " });

		const kofiLink = linksContainer.createEl("a", {
			href: "https://ko-fi.com/lonoxx",
			cls: "github-issues-kofi-link",
		});
		kofiLink.setAttribute("target", "_blank");
		const kofiIcon = kofiLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(kofiIcon, "coffee");
		kofiLink.createSpan({ text: "Ko-fi" });

		linksContainer.createSpan({ text: " • " });

		const bmcLink = linksContainer.createEl("a", {
			href: "https://buymeacoffee.com/lonoxx",
			cls: "github-issues-bmc-link",
		});
		bmcLink.setAttribute("target", "_blank");
		const bmcIcon = bmcLink.createSpan({ cls: "github-issues-link-icon" });
		setIcon(bmcIcon, "pizza");
		bmcLink.createSpan({ text: "Buy me a Pizza" });

		// Authentication Section
		const authContainer = containerEl.createDiv("github-issues-settings-group github-issues-settings-group-compact");
		new Setting(authContainer).setName("Authentication").setHeading();

		const tokenSetting = new Setting(authContainer)
			.setName("GitHub token")
			.setDesc("Your GitHub personal access token");

		let isTokenVisible = false;
		const tokenInput = tokenSetting.addText((text) => {
			text
				.setPlaceholder("Enter your GitHub token")
				.setValue(this.plugin.settings.githubToken)
				.onChange(async (value) => {
					this.plugin.settings.githubToken = value;
					await this.plugin.saveSettings();
					this.updateTokenBadge(); // Update badge when token changes
				});
			text.inputEl.type = "password";
			return text;
		});

		tokenSetting.addButton((button) => {
			button
				.setIcon("eye")
				.setTooltip("Show/hide token")
				.onClick(() => {
					isTokenVisible = !isTokenVisible;
					const inputEl = tokenSetting.controlEl.querySelector("input");
					if (inputEl) {
						inputEl.type = isTokenVisible ? "text" : "password";
					}
					button.setIcon(isTokenVisible ? "eye-off" : "eye");
				});
		});

		// Add token status badge
		const tokenBadgeContainer = authContainer.createDiv("github-issues-token-badge-container");
		// Update badge asynchronously without blocking the UI
		setTimeout(() => this.updateTokenBadge(tokenBadgeContainer), 0);

		const tokenInfo = authContainer.createEl("p", {
			text: "Please limit the token to the minimum permissions needed. Requirements are Issues, Pull Requests, and Repositories. ",
		});
		tokenInfo.addClass("github-issues-info-text");

		const infoLink = tokenInfo.createEl("a", {
			text: "Learn more",
		});
		infoLink.addClass("github-issues-info-link");
		infoLink.href =
			"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token";
		infoLink.target = "_blank";

		// Sync Settings Section
		const syncContainer = containerEl.createDiv("github-issues-settings-group");
		new Setting(syncContainer).setName("Sync Settings").setHeading();

		new Setting(syncContainer)
			.setName("Sync on startup")
			.setDesc("Automatically sync when Obsidian starts")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.syncOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(syncContainer)
			.setName("Enable background sync")
			.setDesc("Automatically sync periodically in the background")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBackgroundSync)
					.onChange(async (value) => {
						this.plugin.settings.enableBackgroundSync = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh settings tab to show/hide interval
					}),
			);

		if (this.plugin.settings.enableBackgroundSync) {
			new Setting(syncContainer)
				.setName("Background sync interval")
				.setDesc("How often to sync in the background (minutes, min: 5)")
				.addText((text) =>
					text
						.setPlaceholder("30")
						.setValue(
							this.plugin.settings.backgroundSyncInterval.toString(),
						)
						.onChange(async (value) => {
							let numValue = parseInt(value, 10);
							if (isNaN(numValue) || numValue < 5) {
								numValue = 5;
								this.plugin.showNotice(
									"Background sync interval set to minimum 5 minutes.",
									"warning",
								);
							}
							this.plugin.settings.backgroundSyncInterval =
								numValue;
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(syncContainer)
			.setName("Cleanup closed items after (days)")
			.setDesc("Delete local files for items closed longer than this many days")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(
						this.plugin.settings.cleanupClosedIssuesDays.toString(),
					)
					.onChange(async (value) => {
						let numValue = parseInt(value, 10);
						if (isNaN(numValue) || numValue < 1) {
							numValue = 1;
							this.plugin.showNotice(
								"Cleanup check for closed items set to minimum 1 day.",
								"warning",
							);
						}
						this.plugin.settings.cleanupClosedIssuesDays = numValue;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(syncContainer)
			.setName("Notification level")
			.setDesc("Control the level of notifications shown during sync")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("minimal", "Minimal")
					.addOption("normal", "Normal")
					.addOption("extensive", "Extensive")
					.addOption("debug", "Debug")
					.setValue(this.plugin.settings.syncNoticeMode)
					.onChange(async (value) => {
						this.plugin.settings.syncNoticeMode = value as
							| "minimal"
							| "normal"
							| "extensive"
							| "debug";
						await this.plugin.saveSettings();
					});
			});

		// Advanced Settings Section
		const advancedContainer = containerEl.createDiv("github-issues-settings-group");
		new Setting(advancedContainer).setName("Advanced Settings").setHeading();

		// Template variables help
		this.addTemplateVariablesHelp(advancedContainer, 'issue');

		new Setting(advancedContainer)
			.setName("Date format")
			.setDesc("Format for dates in issue files (e.g., yyyy-MM-dd HH:mm:ss)")
			.addText((text) =>
				text
					.setPlaceholder("yyyy-MM-dd HH:mm:ss")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(advancedContainer)
			.setName("Body content escaping")
			.setDesc("Security level for handling content from GitHub")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"disabled",
						"Disabled - No escaping (may allow malicious content)",
					)
					.addOption(
						"normal",
						"Normal - Basic escaping for plugins like templater and dataview",
					)
					.addOption(
						"strict",
						"Strict - Remove potentially dangerous characters",
					)
					.addOption(
						"veryStrict",
						"Very strict - Remove many special characters",
					)
					.setValue(this.plugin.settings.escapeMode)
					.onChange(async (value) => {
						if (value === "disabled") {
							const modal = new Modal(this.app);
							modal.titleEl.setText("Security Warning");
							modal.contentEl.setText(
								"Disabling body content escaping may allow malicious scripts to execute in your vault. Are you sure you want to continue?",
							);
							const buttonContainer = modal.contentEl.createDiv();
							buttonContainer.addClass(
								"github-issues-button-container",
							);

							const cancelButton =
								buttonContainer.createEl("button");
							cancelButton.setText("Cancel");
							cancelButton.onclick = () => {
								dropdown.setValue("strict");
								modal.close();
							};

							const continueButton =
								buttonContainer.createEl("button");
							continueButton.setText("Continue");
							continueButton.addClass("mod-warning");
							continueButton.onclick = async () => {
								this.plugin.settings.escapeMode = value as
									| "disabled"
									| "normal"
									| "strict"
									| "veryStrict";
								await this.plugin.saveSettings();
								modal.close();
							};

							modal.open();
							return;
						}
						this.plugin.settings.escapeMode = value as
							| "disabled"
							| "normal"
							| "strict"
							| "veryStrict";
						await this.plugin.saveSettings();
					}),
			);

		const escapingInfo = advancedContainer.createDiv();
		escapingInfo.addClass("github-issues-info-text");
		escapingInfo.style.marginTop = "8px";

		const escapingDetails = escapingInfo.createEl("details");
		const escapingSummary = escapingDetails.createEl("summary");
		escapingSummary.textContent = "Escaping mode details";
		escapingSummary.style.cursor = "pointer";
		escapingSummary.style.fontWeight = "500";

		const escapingContent = escapingDetails.createDiv();
		escapingContent.style.marginTop = "8px";
		escapingContent.style.paddingLeft = "12px";

		const warningP = escapingContent.createEl("p");
		warningP.textContent = "⚠️ CAUTION: Disabling escaping may allow malicious scripts to execute";
		warningP.addClass("github-issues-warning-text");

		escapingContent.createEl("p").textContent = "• Normal: Escapes template syntax like '`', '{{', '}}', '<%', '%>'";
		escapingContent.createEl("p").textContent = "• Strict: Only allows alphanumeric, '.,'()/[]{}*+-:\"' and whitespace";
		escapingContent.createEl("p").textContent = "• Very Strict: Only allows alphanumeric, '.,' and whitespace";

		// Global Defaults Section
		const globalDefaultsContainer = containerEl.createDiv("github-issues-settings-group");
		const globalDefaultsHeader = new Setting(globalDefaultsContainer)
			.setName("Global Defaults")
			.setDesc("Default settings applied to all repositories (can be overridden per repository)")
			.setHeading();

		const globalDefaultsContent = globalDefaultsContainer.createDiv("github-issues-collapsible-content");

		// Add collapse toggle
		globalDefaultsHeader.addButton((button) => {
			button.setIcon("chevron-up");
			button.setClass("github-issues-collapse-toggle");
			button.onClick(() => {
				const isCollapsed = globalDefaultsContent.hasClass("github-issues-collapsed");
				if (isCollapsed) {
					globalDefaultsContent.removeClass("github-issues-collapsed");
					button.setIcon("chevron-up");
				} else {
					globalDefaultsContent.addClass("github-issues-collapsed");
					button.setIcon("chevron-down");
				}
			});
		});


		// Issues Subsection
		const issuesGlobalContainer = globalDefaultsContent.createDiv("github-issues-nested");
		new Setting(issuesGlobalContainer).setName("Issues").setHeading();

		new Setting(issuesGlobalContainer)
			.setName("Update mode")
			.setDesc("How to handle updates to existing issue files")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing files")
					.addOption("update", "Update - Replace entire content")
					.addOption("append", "Append - Add new content")
					.setValue(this.plugin.settings.globalDefaults.issueUpdateMode)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueUpdateMode = value as "none" | "update" | "append";
						await this.plugin.saveSettings();
					})
			);

		new Setting(issuesGlobalContainer)
			.setName("Allow deletion")
			.setDesc("Allow deletion of local issue files when closed on GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.allowDeleteIssue)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.allowDeleteIssue = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(issuesGlobalContainer)
			.setName("Folder")
			.setDesc("Default folder where issue files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub")
					.setValue(this.plugin.settings.globalDefaults.issueFolder)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(issuesGlobalContainer)
			.setName("Filename template")
			.setDesc("Template for issue filenames")
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(this.plugin.settings.globalDefaults.issueNoteTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(issuesGlobalContainer)
			.setName("Content template")
			.setDesc("Template file for issue content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.globalDefaults.issueContentTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.issueContentTemplate = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(issuesGlobalContainer)
			.setName("Include comments")
			.setDesc("Include comments in issue files")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.includeIssueComments)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.includeIssueComments = value;
						await this.plugin.saveSettings();
					})
			);

		// Pull Requests Subsection
		const prGlobalContainer = globalDefaultsContent.createDiv("github-issues-nested");
		new Setting(prGlobalContainer).setName("Pull Requests").setHeading();

		new Setting(prGlobalContainer)
			.setName("Update mode")
			.setDesc("How to handle updates to existing pull request files")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing files")
					.addOption("update", "Update - Replace entire content")
					.addOption("append", "Append - Add new content")
					.setValue(this.plugin.settings.globalDefaults.pullRequestUpdateMode)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestUpdateMode = value as "none" | "update" | "append";
						await this.plugin.saveSettings();
					})
			);

		new Setting(prGlobalContainer)
			.setName("Allow deletion")
			.setDesc("Allow deletion of local PR files when closed on GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.allowDeletePullRequest)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.allowDeletePullRequest = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(prGlobalContainer)
			.setName("Folder")
			.setDesc("Default folder where pull request files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Pull Requests")
					.setValue(this.plugin.settings.globalDefaults.pullRequestFolder)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(prGlobalContainer)
			.setName("Filename template")
			.setDesc("Template for pull request filenames")
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(this.plugin.settings.globalDefaults.pullRequestNoteTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestNoteTemplate = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(prGlobalContainer)
			.setName("Content template")
			.setDesc("Template file for pull request content (optional)")
			.addText((text) => {
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.globalDefaults.pullRequestContentTemplate)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.pullRequestContentTemplate = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(prGlobalContainer)
			.setName("Include comments")
			.setDesc("Include comments in pull request files")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.globalDefaults.includePullRequestComments)
					.onChange(async (value) => {
						this.plugin.settings.globalDefaults.includePullRequestComments = value;
						await this.plugin.saveSettings();
					})
			);

		// Repositories Section
		const repoContainer = containerEl.createDiv("github-issues-settings-group");
		repoContainer.style.marginTop = "30px";

		new Setting(repoContainer).setName("Repositories").setHeading();
		const repoTabsContainer = repoContainer.createDiv(
			"github-issues-repos-tabs-container",
		);

		const trackedReposTab = repoTabsContainer.createEl("button", {
			text: "Tracked Repositories",
		});
		trackedReposTab.addClass("github-issues-tab");
		trackedReposTab.addClass("mod-cta");

		const availableReposTab = repoTabsContainer.createEl("button", {
			text: "Available Repositories",
		});
		availableReposTab.addClass("github-issues-tab");

		const trackedReposContent = repoContainer.createDiv(
			"github-issues-tab-content",
		);
		trackedReposContent.addClass("active");

		const availableReposContent = repoContainer.createDiv(
			"github-issues-tab-content",
		);

		const trackedHeader = trackedReposContent.createDiv(
			"github-issues-tracked-header",
		);

		const manualAddContainer = trackedHeader.createDiv(
			"github-issues-manual-add-container",
		);

		const manualAddHeaderContainer = manualAddContainer.createDiv(
			"github-issues-manual-add-header",
		);

		const addRepoHeading = manualAddHeaderContainer.createEl("h4", {
			text: "Add Repository Manually",
		});

		const addForm = manualAddContainer.createDiv(
			"github-issues-manual-add-form",
		);
		const formText = addForm.createEl("p", {
			text: "Enter the repository in owner/name format to add it to your tracked repositories.",
		});
		formText.addClass("github-issues-form-description");

		const inputContainer = addForm.createDiv(
			"github-issues-input-container",
		);
		const repoInput = inputContainer.createEl("input");
		repoInput.type = "text";
		repoInput.placeholder = "e.g., owner/repo-name";
		repoInput.addClass("github-issues-repo-input");

		const addButton = inputContainer.createEl("button", {
			text: "Add Repository",
		});
		addButton.addClass("github-issues-add-button");

		addButton.onclick = async () => {
			const repo = repoInput.value.trim();

			if (!repo) {
				new Notice("Please enter both owner and repository name");
				return;
			}

			await this.addRepository(repo);
			repoInput.value = "";
		};

		const trackedSearchContainer = trackedReposContent.createDiv(
			"github-issues-search-container",
		);
		trackedSearchContainer.addClass("github-issues-tracked-search");
		const searchHeaderContainer = trackedSearchContainer.createDiv(
			"github-issues-search-header",
		);
		const searchIconContainer = searchHeaderContainer.createDiv(
			"github-issues-search-icon",
		);
		setIcon(searchIconContainer, "search");

		const searchLabel = searchHeaderContainer.createEl("label", {
			text: "Search tracked repositories",
		});
		searchLabel.addClass("github-issues-search-label");

		const searchInputContainer = trackedSearchContainer.createDiv(
			"github-issues-search-input-container",
		);
		const searchInput = searchInputContainer.createEl("input");
		searchInput.type = "text";
		searchInput.placeholder = "Filter by name or owner...";
		searchInput.addClass("github-issues-search-input");
		const clearButton = searchInputContainer.createDiv(
			"github-issues-search-clear-button github-issues-hidden",
		);
		setIcon(clearButton, "x");
		clearButton.addEventListener("click", () => {
			searchInput.value = "";
			clearButton.classList.add("github-issues-hidden");
			searchInput.dispatchEvent(new Event("input"));
			searchInput.focus();
		});

		const statsCounter = trackedSearchContainer.createDiv(
			"github-issues-stats-counter",
		);
		statsCounter.setText(
			`Showing all ${this.plugin.settings.repositories.length} repositories`,
		);
		searchInput.addEventListener("input", () => {
			const searchTerm = searchInput.value.toLowerCase();

			if (searchTerm.length > 0) {
				clearButton.classList.remove("github-issues-hidden");
			} else {
				clearButton.classList.add("github-issues-hidden");
			}

			const repoItems = trackedReposContent.querySelectorAll(
				".github-issues-repo-settings",
			);
			let visibleRepositories = 0;

			const visibleReposByOwner: Record<string, number> = {};

			repoItems.forEach((item) => {
				const repoName =
					item.getAttribute("data-repo-name")?.toLowerCase() || "";
				const ownerName =
					item.getAttribute("data-owner-name")?.toLowerCase() || "";
				const fullName =
					item.getAttribute("data-full-name")?.toLowerCase() || "";

				if (
					fullName.includes(searchTerm) ||
					repoName.includes(searchTerm) ||
					ownerName.includes(searchTerm)
				) {
					(item as HTMLElement).classList.remove(
						"github-issues-hidden",
					);
					visibleRepositories++;

					if (!visibleReposByOwner[ownerName]) {
						visibleReposByOwner[ownerName] = 0;
					}
					visibleReposByOwner[ownerName]++;
				} else {
					(item as HTMLElement).classList.add("github-issues-hidden");
				}
			});

			const ownerGroups = trackedReposContent.querySelectorAll(
				".github-issues-repo-owner-group",
			);
			ownerGroups.forEach((group) => {
				const ownerName =
					group.getAttribute("data-owner")?.toLowerCase() || "";

				if (
					visibleReposByOwner[ownerName] &&
					visibleReposByOwner[ownerName] > 0
				) {
					(group as HTMLElement).classList.remove(
						"github-issues-hidden",
					);
				} else {
					(group as HTMLElement).classList.add(
						"github-issues-hidden",
					);
				}
			});

			if (searchTerm.length > 0) {
				statsCounter.setText(
					`Showing ${visibleRepositories} of ${this.plugin.settings.repositories.length} repositories`,
				);
			} else {
				statsCounter.setText(
					`Showing all ${this.plugin.settings.repositories.length} repositories`,
				);
			}

			const noRepos = trackedReposContent.querySelector(
				".github-issues-no-repos",
			);
			if (noRepos) {
				noRepos.classList.toggle(
					"github-issues-hidden",
					visibleRepositories > 0,
				);
			}

			const noResults = trackedReposContent.querySelector(
				".github-issues-no-results",
			);
			if (noResults) {
				noResults.classList.toggle(
					"github-issues-hidden",
					visibleRepositories > 0 ||
						this.plugin.settings.repositories.length === 0,
				);
			}
		});

		const loadButtonContainer = availableReposContent.createDiv(
			"github-issues-load-repos-container",
		);

		const loadDescription = loadButtonContainer.createEl("p", {
			text: "Load your GitHub repositories to add them to tracking.",
			cls: "github-issues-load-description",
		});

		const loadButton = loadButtonContainer.createEl("button");
		loadButton.addClass("github-issues-action-button");
		const buttonIcon = loadButton.createEl("span", {
			cls: "github-issues-button-icon",
		});
		setIcon(buttonIcon, "download");
		loadButton.createEl("span", { text: "Load Repositories" });

		const reposResultsContainer = availableReposContent.createDiv(
			"github-issues-repos-results-container",
		);
		reposResultsContainer.addClass("github-issues-hidden");

		loadButton.onclick = async () => {
			loadButton.disabled = true;
			const buttonText = loadButton.querySelector("span:last-child");
			if (buttonText) {
				buttonText.textContent = "Loading...";
			}

			await this.renderAvailableRepositories(reposResultsContainer);
			reposResultsContainer.removeClass("github-issues-hidden");
			loadButtonContainer.addClass("github-issues-hidden");
		};

		this.renderRepositoriesList(trackedReposContent);

		trackedReposTab.onclick = () => {
			trackedReposTab.addClass("mod-cta");
			availableReposTab.removeClass("mod-cta");
			trackedReposContent.addClass("active");
			availableReposContent.removeClass("active");
		};

		availableReposTab.onclick = () => {
			availableReposTab.addClass("mod-cta");
			trackedReposTab.removeClass("mod-cta");
			availableReposContent.addClass("active");
			trackedReposContent.removeClass("active");
		};
	}

	private showAddRepositoryModal(): void {
		const modal = new Modal(this.app);
		modal.containerEl.addClass("github-issues-modal");
		modal.titleEl.setText("Add repository");

		const formContainer = modal.contentEl.createDiv();
		formContainer.addClass("github-issues-form-container");

		const tabsContainer = formContainer.createDiv();
		tabsContainer.addClass("github-issues-tabs-container");

		const manualTab = tabsContainer.createEl("button");
		manualTab.setText("Manual entry");
		manualTab.addClass("mod-cta");

		const githubTab = tabsContainer.createEl("button");
		githubTab.setText("From GitHub");

		const manualContent = formContainer.createDiv();
		manualContent.addClass("github-issues-tab-content");
		manualContent.addClass("active");

		const githubContent = formContainer.createDiv();
		githubContent.addClass("github-issues-tab-content");

		const manualForm = manualContent.createDiv();
		manualForm.addClass("github-issues-manual-form-container");

		const repoContainer = manualForm.createDiv();
		repoContainer.addClass("github-issues-container");
		repoContainer.createEl("label", { text: "Repository (owner/name)" });
		const repoInput = repoContainer.createEl("input");
		repoInput.type = "text";
		repoInput.placeholder = "e.g., owner/repo-name";

		const githubList = githubContent.createDiv();
		githubList.addClass("github-issues-list");

		manualTab.onclick = () => {
			manualTab.addClass("mod-cta");
			githubTab.removeClass("mod-cta");
			manualContent.addClass("active");
			githubContent.removeClass("active");

			buttonContainer.addClass("github-issues-visible-flex");
			buttonContainer.removeClass("github-issues-hidden");
		};

		githubTab.onclick = async () => {
			githubTab.addClass("mod-cta");
			manualTab.removeClass("mod-cta");
			manualContent.removeClass("active");
			githubContent.addClass("active");
			buttonContainer.addClass("github-issues-hidden");
			buttonContainer.removeClass("github-issues-visible-flex");
			await this.renderGitHubRepositories(githubList, modal);
		};

		const buttonContainer = formContainer.createDiv();
		buttonContainer.addClass("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();

		const addButton = buttonContainer.createEl("button");
		addButton.setText("Add");
		addButton.onclick = async () => {
			const repo = repoInput.value.trim();

			if (!repo) {
				new Notice("Please enter both owner and repository name");
				return;
			}

			await this.addRepository(repo);
			modal.close();
		};

		modal.open();
	}

	private async renderGitHubRepositories(
		container: HTMLElement,
		modal?: Modal,
	): Promise<void> {
		container.empty();
		container.createEl("p", { text: "Loading repositories..." });

		try {
			const repos = await this.plugin.fetchAvailableRepositories();

			container.empty();

			const searchContainer = container.createDiv(
				"github-issues-search-container",
			);
			searchContainer.addClass("github-issues-modal-search");

			const searchHeaderContainer = searchContainer.createDiv(
				"github-issues-search-header",
			);
			const searchIconContainer = searchHeaderContainer.createDiv(
				"github-issues-search-icon",
			);
			setIcon(searchIconContainer, "search");

			const searchLabel = searchHeaderContainer.createEl("label", {
				text: "Search repositories",
			});
			searchLabel.addClass("github-issues-search-label");

			const searchInputContainer = searchContainer.createDiv(
				"github-issues-search-input-container",
			);
			const searchInput = searchInputContainer.createEl("input");
			searchInput.type = "text";
			searchInput.placeholder = "Filter by name or owner...";
			searchInput.addClass("github-issues-search-input");
			const clearButton = searchInputContainer.createDiv(
				"github-issues-search-clear-button github-issues-hidden",
			);
			setIcon(clearButton, "x");
			clearButton.addEventListener("click", () => {
				searchInput.value = "";
				clearButton.classList.add("github-issues-hidden");
				searchInput.dispatchEvent(new Event("input"));
				searchInput.focus();
			});

			const statsCounter = searchContainer.createDiv(
				"github-issues-stats-counter",
			);
			statsCounter.setText(`Showing all ${repos.length} repositories`);

			const repoListContainer = container.createDiv(
				"github-issues-repo-list",
			);

			const noResultsMessage = container.createDiv(
				"github-issues-no-results",
			);
			const noResultsIcon = noResultsMessage.createDiv(
				"github-issues-no-results-icon",
			);
			setIcon(noResultsIcon, "minus-circle");
			const noResultsText = noResultsMessage.createDiv(
				"github-issues-no-results-text",
			);
			noResultsText.setText("No matching repositories found");
			noResultsMessage.addClass("github-issues-hidden");

			const reposByOwner: Record<
				string,
				{ owner: string; repos: any[] }
			> = {};

			// Sort and group repositories by owner
			for (const repo of repos) {
				const ownerName = repo.owner.login;
				if (!reposByOwner[ownerName]) {
					reposByOwner[ownerName] = {
						owner: ownerName,
						repos: [],
					};
				}
				reposByOwner[ownerName].repos.push(repo);
			}

			// Sort owners alphabetically
			const sortedOwners = Object.keys(reposByOwner).sort();

			// Render each owner group
			for (const ownerName of sortedOwners) {
				const ownerData = reposByOwner[ownerName];
				const ownerContainer = repoListContainer.createDiv();
				ownerContainer.addClass("github-issues-repo-owner-group");
				ownerContainer.setAttribute(
					"data-owner",
					ownerName.toLowerCase(),
				);

				const ownerHeader = ownerContainer.createDiv(
					"github-issues-repo-owner-header",
				);
				const ownerIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-icon",
				});
				setIcon(ownerIcon, "user");
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-name",
					text: ownerName,
				});
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-count",
					text: ownerData.repos.length.toString(),
				});

				// Sort repositories by name
				ownerData.repos.sort((a, b) => a.name.localeCompare(b.name));

				const reposContainer = ownerContainer.createDiv(
					"github-issues-owner-repos",
				);

				for (const repo of ownerData.repos) {
					const repoName = `${repo.owner.login}/${repo.name}`;
					const isTracked = this.plugin.settings.repositories.some(
						(r) => r.repository === repoName,
					);

					const repoItem = reposContainer.createDiv();
					repoItem.addClass("github-issues-item");
					repoItem.setAttribute(
						"data-repo-name",
						repo.name.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-owner-name",
						repo.owner.login.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-full-name",
						repoName.toLowerCase(),
					);
					const repoInfoContainer = repoItem.createDiv(
						"github-issues-repo-info",
					);

					const repoIcon = repoInfoContainer.createDiv(
						"github-issues-repo-icon",
					);
					setIcon(repoIcon, "github");

					const repoText = repoInfoContainer.createEl("span");
					repoText.setText(repo.name);
					repoText.addClass("github-issues-repo-name");

					const actionContainer = repoItem.createDiv(
						"github-issues-repo-action",
					);

					if (!isTracked) {
						const addButton = actionContainer.createEl("button");
						const addIcon = addButton.createEl("span", {
							cls: "github-issues-button-icon",
							text: "+",
						});
						addButton.createEl("span", {
							cls: "github-issues-button-text",
							text: "Add",
						});
						addButton.addClass("github-issues-add-button");
						addButton.onclick = async () => {
							await this.addRepository(repoName);
							new Notice(`Added repository: ${repoName}`);
							addButton.remove();

							const trackedContainer = actionContainer.createDiv(
								"github-issues-tracked-container",
							);
							setIcon(trackedContainer, "check");
							const trackedText =
								trackedContainer.createEl("span");
							trackedText.setText("Tracked");
							trackedText.addClass("github-issues-info-text");
							this.display();

							const visibleItems =
								repoListContainer.querySelectorAll(
									".github-issues-item:not(.github-issues-hidden)",
								);
							statsCounter.setText(
								`Showing ${visibleItems.length} of ${repos.length} repositories`,
							);
						};
					} else {
						const trackedContainer = actionContainer.createDiv(
							"github-issues-tracked-container",
						);
						setIcon(trackedContainer, "check");
						const trackedText = trackedContainer.createEl("span");
						trackedText.setText("Tracked");
						trackedText.addClass("github-issues-info-text");
					}
				}
			}

			searchInput.addEventListener("input", () => {
				const searchTerm = searchInput.value.toLowerCase();

				if (searchTerm.length > 0) {
					clearButton.classList.remove("github-issues-hidden");
				} else {
					clearButton.classList.add("github-issues-hidden");
				}

				const repoItems = repoListContainer.querySelectorAll(
					".github-issues-item",
				);
				let visibleCount = 0;

				const visibleReposByOwner: Record<string, number> = {};

				repoItems.forEach((item) => {
					const repoName = item.getAttribute("data-repo-name") || "";
					const ownerName =
						item.getAttribute("data-owner-name") || "";
					const fullName = item.getAttribute("data-full-name") || "";

					if (
						fullName.includes(searchTerm) ||
						repoName.includes(searchTerm) ||
						ownerName.includes(searchTerm)
					) {
						(item as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
						visibleCount++;
						if (!visibleReposByOwner[ownerName]) {
							visibleReposByOwner[ownerName] = 0;
						}
						visibleReposByOwner[ownerName]++;
					} else {
						(item as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				const ownerGroups = repoListContainer.querySelectorAll(
					".github-issues-repo-owner-group",
				);
				ownerGroups.forEach((group) => {
					const ownerName = group.getAttribute("data-owner") || "";

					if (
						visibleReposByOwner[ownerName] &&
						visibleReposByOwner[ownerName] > 0
					) {
						(group as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
					} else {
						(group as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				if (searchTerm.length > 0) {
					statsCounter.setText(
						`Showing ${visibleCount} of ${repos.length} repositories`,
					);
				} else {
					statsCounter.setText(
						`Showing all ${repos.length} repositories`,
					);
				}

				noResultsMessage.classList.toggle(
					"github-issues-hidden",
					visibleCount > 0,
				);
			});
		} catch (error) {
			container.empty();
			container.createEl("p", {
				text: `Error loading repositories: ${(error as Error).message}`,
			});
		}
	}

	private async addRepository(repoName: string): Promise<void> {
		if (
			this.plugin.settings.repositories.some(
				(r) => r.repository === repoName,
			)
		) {
			new Notice("This repository is already being tracked");
			return;
		}

		const newRepo = {
			...DEFAULT_REPOSITORY_TRACKING,
			repository: repoName,
		};
		this.plugin.settings.repositories.push(newRepo);
		await this.plugin.saveSettings();
		this.display();
		new Notice(`Added repository: ${repoName}`);
	}

	private async addMultipleRepositories(repoNames: string[]): Promise<void> {
		const newRepos: string[] = [];
		const existingRepos: string[] = [];
		for (const repoName of repoNames) {
			if (
				this.plugin.settings.repositories.some(
					(r) => r.repository === repoName,
				)
			) {
				existingRepos.push(repoName);
			} else {
				newRepos.push(repoName);
			}
		}

		for (const repoName of newRepos) {
			const newRepo = {
				...DEFAULT_REPOSITORY_TRACKING,
				repository: repoName,
			};
			this.plugin.settings.repositories.push(newRepo);
		}

		if (newRepos.length > 0) {
			await this.plugin.saveSettings();
			this.display();
		}

		if (newRepos.length > 0 && existingRepos.length > 0) {
			new Notice(
				`Added ${newRepos.length} repositories. ${existingRepos.length} were already tracked.`,
			);
		} else if (newRepos.length > 0) {
			new Notice(`Added ${newRepos.length} repositories successfully.`);
		} else if (existingRepos.length > 0) {
			new Notice(`All selected repositories are already being tracked.`);
		}

		this.selectedRepositories.clear();
	}

	private renderRepositoriesList(container: HTMLElement): void {
		const reposContainer = container.createDiv(
			"github-issues-repos-container",
		);

		const reposByOwner: Record<
			string,
			{
				repos: RepositoryTracking[];
				fullNames: string[];
				isUser: boolean;
			}
		> = {};

		for (const repo of this.plugin.settings.repositories) {
			const [owner, repoName] = repo.repository.split("/");
			if (!owner || !repoName) continue;

			if (!reposByOwner[owner]) {
				const isCurrentUser =
					this.plugin.currentUser &&
					this.plugin.currentUser.toLowerCase() ===
						owner.toLowerCase();
				reposByOwner[owner] = {
					repos: [],
					fullNames: [],
					isUser: !!isCurrentUser,
				};
			}
			reposByOwner[owner].repos.push(repo);
			reposByOwner[owner].fullNames.push(repo.repository);
		}

		const sortedOwners = Object.keys(reposByOwner).sort((a, b) => {
			if (reposByOwner[a].isUser && !reposByOwner[b].isUser) return -1;
			if (!reposByOwner[a].isUser && reposByOwner[b].isUser) return 1;
			return a.localeCompare(b);
		});

		const reposListContainer = reposContainer.createDiv(
			"github-issues-tracked-repos-list",
		);
		const noResultsMessage = reposContainer.createDiv(
			"github-issues-no-results",
		);
		const noResultsIcon = noResultsMessage.createDiv(
			"github-issues-no-results-icon",
		);
		setIcon(noResultsIcon, "minus-circle");
		const noResultsText = noResultsMessage.createDiv(
			"github-issues-no-results-text",
		);
		noResultsText.setText("No matching repositories found");
		noResultsMessage.addClass("github-issues-hidden");

		for (const owner of sortedOwners) {
			const ownerContainer = reposListContainer.createDiv(
				"github-issues-repo-owner-group",
			);
			ownerContainer.setAttribute("data-owner", owner.toLowerCase());

			const ownerHeader = ownerContainer.createDiv(
				"github-issues-repo-owner-header",
			);
			const ownerType = reposByOwner[owner].isUser
				? "User"
				: "Organization";

			// Chevron icon for collapse/expand
			const chevronIcon = ownerHeader.createEl("span", {
				cls: "github-issues-repo-owner-chevron",
			});
			setIcon(chevronIcon, "chevron-right");

			const ownerIcon = ownerHeader.createEl("span", {
				cls: "github-issues-repo-owner-icon",
			});
			setIcon(ownerIcon, ownerType === "User" ? "user" : "building");
			ownerHeader.createEl("span", {
				cls: "github-issues-repo-owner-name",
				text: owner,
			});
			ownerHeader.createEl("span", {
				cls: "github-issues-repo-count",
				text: reposByOwner[owner].repos.length.toString(),
			});

			const reposContainer = ownerContainer.createDiv(
				"github-issues-owner-repos",
			);

			// Make owner header collapsible
			ownerHeader.addEventListener("click", (e) => {
				e.stopPropagation();
				const isExpanded = ownerContainer.classList.contains("github-issues-owner-expanded");
				if (isExpanded) {
					ownerContainer.classList.remove("github-issues-owner-expanded");
					setIcon(chevronIcon, "chevron-right");
				} else {
					ownerContainer.classList.add("github-issues-owner-expanded");
					setIcon(chevronIcon, "chevron-down");
				}
			});

			const sortedRepos = reposByOwner[owner].repos.sort((a, b) => {
				const aName = a.repository.split("/")[1] || "";
				const bName = b.repository.split("/")[1] || "";
				return aName.localeCompare(bName);
			});

			for (const repo of sortedRepos) {
				const repoName = repo.repository.split("/")[1] || "";

				const repoItem = reposContainer.createDiv(
					"github-issues-item github-issues-repo-settings",
				);
				repoItem.setAttribute("data-repo-name", repoName.toLowerCase());
				repoItem.setAttribute("data-owner-name", owner.toLowerCase());
				repoItem.setAttribute(
					"data-full-name",
					repo.repository.toLowerCase(),
				);
				const headerContainer = repoItem.createDiv(
					"github-issues-repo-header-container",
				);

				const repoInfoContainer = headerContainer.createDiv(
					"github-issues-repo-info",
				);

				const repoIcon = repoInfoContainer.createDiv(
					"github-issues-repo-icon",
				);
				setIcon(repoIcon, "github");

				const repoText = repoInfoContainer.createEl("span");
				repoText.setText(repoName);
				repoText.addClass("github-issues-repo-name");

				const actionContainer = headerContainer.createDiv(
					"github-issues-repo-action",
				);

				const syncButton = actionContainer.createEl("button", {
					text: "Sync",
				});
				syncButton.addClass("github-issues-sync-button");
				syncButton.onclick = async (e) => {
					e.stopPropagation();

					// Disable button and show loading state
					syncButton.disabled = true;
					const originalText = syncButton.textContent || "Sync";
					syncButton.textContent = "Syncing...";

					try {
						await this.plugin.syncSingleRepository(repo.repository);
					} finally {
						// Re-enable button and restore original state
						syncButton.disabled = false;
						syncButton.textContent = originalText;
					}
				};

				const configButton = actionContainer.createEl("button", {
					text: "Configure",
				});
				configButton.addClass("github-issues-config-button");

				const deleteButton = actionContainer.createEl("button");
				deleteButton.createEl("span", {
					cls: "github-issues-button-icon",
					text: "×",
				});
				deleteButton.createEl("span", {
					cls: "github-issues-button-text",
					text: "Remove",
				});
				deleteButton.addClass("github-issues-remove-button");
				deleteButton.onclick = async () => {
					await this.showDeleteRepositoryModal(repo);
				};

				const detailsContainer = repoItem.createDiv(
					"github-issues-repo-details",
				);

				// Populate detailsContainer immediately
				const description = detailsContainer.createEl("p", {
					text: "Configure tracking settings for this repository",
				});
				description.addClass("github-issues-repo-description");

				// Add "Ignore global defaults" toggle at the top
				new Setting(detailsContainer)
					.setName("Ignore global defaults")
					.setDesc("Use repository-specific settings instead of global defaults")
					.addToggle((toggle) =>
						toggle.setValue(repo.ignoreGlobalSettings).onChange(async (value) => {
							repo.ignoreGlobalSettings = value;
							await this.plugin.saveSettings();
						}),
					);

				const issuesContainer = detailsContainer.createDiv(
					"github-issues-settings-section",
				);
				const pullRequestsContainer = detailsContainer.createDiv(
					"github-issues-settings-section",
				);

				this.renderIssueSettings(issuesContainer, repo);
				this.renderPullRequestSettings(pullRequestsContainer, repo);

				const toggleDetails = () => {
					repoItem.classList.toggle("github-issues-expanded");
				};

				configButton.onclick = toggleDetails;

				headerContainer.onclick = (e) => {
					if (
						!(e.target as Element).closest(
							".github-issues-remove-button",
						) &&
						!(e.target as Element).closest(
							".github-issues-sync-button",
						) &&
						!(e.target as Element).closest(
							".github-issues-config-button",
						)
					) {
						toggleDetails();
					}
				};
			}
		}

		const noTrackedRepos = reposContainer.createEl("p", {
			text: "No repositories tracked. Please add a repository to get started.",
		});
		noTrackedRepos.addClass("github-issues-no-repos");
		noTrackedRepos.classList.toggle(
			"github-issues-hidden",
			this.plugin.settings.repositories.length > 0,
		);
	}

	private async showDeleteRepositoryModal(
		repo: RepositoryTracking,
	): Promise<void> {
		const modal = new Modal(this.app);
		modal.containerEl.addClass("github-issues-modal");
		modal.titleEl.setText("Delete repository");

		const contentContainer = modal.contentEl.createDiv(
			"github-issues-delete-modal-content",
		);

		const warningContainer = contentContainer.createDiv(
			"github-issues-warning-icon-container",
		);
		setIcon(warningContainer, "alert-triangle");
		warningContainer.addClass("github-issues-warning-icon");

		const messageContainer = contentContainer.createDiv(
			"github-issues-delete-message",
		);

		const warningText = messageContainer.createEl("p", {
			text: "Are you sure you want to delete ",
		});
		warningText.addClass("github-issues-delete-warning-text");

		const repoNameSpan = warningText.createEl("span");
		repoNameSpan.setText(repo.repository);
		repoNameSpan.addClass("github-issues-delete-repo-name");

		warningText.appendText("?");

		const descriptionText = messageContainer.createEl("p", {
			text: "This will remove all tracking settings for this repository.",
		});
		descriptionText.addClass("github-issues-delete-description");

		const buttonContainer = contentContainer.createDiv();
		buttonContainer.addClass("github-issues-button-container");

		const cancelButton = buttonContainer.createEl("button");
		cancelButton.setText("Cancel");
		cancelButton.onclick = () => modal.close();
		const confirmDeleteButton = buttonContainer.createEl("button");
		const deleteIcon = confirmDeleteButton.createEl("span", {
			cls: "github-issues-button-icon",
		});
		setIcon(deleteIcon, "trash-2");
		confirmDeleteButton.createEl("span", {
			cls: "github-issues-button-text",
			text: "Delete repository",
		});
		confirmDeleteButton.addClass("mod-warning");
		confirmDeleteButton.onclick = async () => {
			this.plugin.settings.repositories =
				this.plugin.settings.repositories.filter(
					(r) => r.repository !== repo.repository,
				);
			await this.plugin.saveSettings();
			this.display();
			modal.close();
			new Notice(`Deleted repository: ${repo.repository}`);
		};

		modal.open();
	}

	private renderIssueSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container).setName("Issues").setHeading();

		container
			.createEl("p", {
				text: "Configure how issues are tracked and stored",
			})
			.addClass("setting-item-description");

		const issuesSettingsContainer = container.createDiv(
			"github-issues-settings-group",
		);

		// Container for the standard issues folder setting
		const standardIssuesFolderContainer = issuesSettingsContainer.createDiv();

		// Container for the custom issues folder setting
		const customIssuesFolderContainer = issuesSettingsContainer.createDiv();

		new Setting(container)
			.setName("Track issues")
			.setDesc("Enable or disable issue tracking for this repository")
			.addToggle((toggle) =>
				toggle.setValue(repo.trackIssues).onChange(async (value) => {
					repo.trackIssues = value;
					issuesSettingsContainer.classList.toggle(
						"github-issues-settings-hidden",
						!value,
					);
					await this.plugin.saveSettings();
				}),
			);
		issuesSettingsContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.trackIssues,
		);

		// Update container visibility based on custom folder setting
		const updateContainerVisibility = () => {
			standardIssuesFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				repo.useCustomIssueFolder,
			);
			customIssuesFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				!repo.useCustomIssueFolder,
			);
		};

		const issuesFolderSetting = new Setting(standardIssuesFolderContainer)
			.setName("Issues folder")
			.setDesc("The folder where issue files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Issues")
					.setValue(repo.issueFolder)
					.onChange(async (value) => {
						repo.issueFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(issuesSettingsContainer)
			.setName("Use custom folder")
			.setDesc("Instead of organizing issues by Owner/Repository, place all issues in a custom folder")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomIssueFolder)
					.onChange(async (value) => {
						repo.useCustomIssueFolder = value;
						updateContainerVisibility();
						await this.plugin.saveSettings();
					});
			});

		// Create the custom folder container first
		const customIssueFolderContainer = issuesSettingsContainer.createDiv(
			"github-issues-settings-group",
		);
		customIssueFolderContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.useCustomIssueFolder,
		);

		new Setting(customIssuesFolderContainer)
			.setName("Custom issues folder")
			.setDesc("Specific folder path where all issues will be placed (overrides the folder structure)")
			.addText((text) => {
				text
					.setPlaceholder("e.g., Issues, GitHub/All Issues")
					.setValue(repo.customIssueFolder)
					.onChange(async (value) => {
						repo.customIssueFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		// Set initial visibility
		updateContainerVisibility();

		new Setting(issuesSettingsContainer)
			.setName("Issue update mode")
			.setDesc("How to handle updates to existing issues")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("none", "None - Don't update existing issues")
					.addOption("update", "Update - Overwrite existing content")
					.addOption("append", "Append - Add new content at the end")
					.setValue(repo.issueUpdateMode)
					.onChange(async (value) => {
						repo.issueUpdateMode = value as
							| "none"
							| "update"
							| "append";
						await this.plugin.saveSettings();
					}),
			);

		// Label filtering settings
		new Setting(issuesSettingsContainer)
			.setName("Filter issues by labels")
			.setDesc("Enable filtering issues based on their labels")
			.addToggle((toggle) =>
				toggle
					.setValue(repo.enableLabelFilter ?? false)
					.onChange(async (value) => {
						repo.enableLabelFilter = value;
						labelFilterContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const labelFilterContainer = issuesSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		labelFilterContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(repo.enableLabelFilter ?? false),
		);

		new Setting(labelFilterContainer)
			.setName("Label filter mode")
			.setDesc("Choose whether to include or exclude issues with the specified labels")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("include", "Include - Only show issues with these labels")
					.addOption("exclude", "Exclude - Hide issues with these labels")
					.setValue(repo.labelFilterMode ?? "include")
					.onChange(async (value) => {
						repo.labelFilterMode = value as "include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(labelFilterContainer)
			.setName("Label filters")
			.setDesc("Comma-separated list of labels to filter by (case-sensitive)")
			.addTextArea((text) => {
				text
					.setPlaceholder("bug, enhancement, help wanted")
					.setValue((repo.labelFilters || []).join(", "))
					.onChange(async (value) => {
						repo.labelFilters = value
							.split(",")
							.map(label => label.trim())
							.filter(label => label.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch available labels")
					.setTooltip("Load labels from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea) {
							await this.fetchAndShowRepositoryLabels(repo.repository, repo, 'labelFilters', textArea);
						}
					}),
			);

		// Assignee filtering settings for issues
		new Setting(issuesSettingsContainer)
			.setName("Filter issues by assignees")
			.setDesc("Enable filtering issues based on who they are assigned to")
			.addToggle((toggle) =>
				toggle
					.setValue(repo.enableAssigneeFilter ?? false)
					.onChange(async (value) => {
						repo.enableAssigneeFilter = value;
						assigneeFilterContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const assigneeFilterContainer = issuesSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		assigneeFilterContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(repo.enableAssigneeFilter ?? false),
		);

		new Setting(assigneeFilterContainer)
			.setName("Assignee filter mode")
			.setDesc("Choose how to filter issues by assignees")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("assigned-to-me", "Assigned to me - Only my issues")
					.addOption("assigned-to-specific", "Assigned to specific users")
					.addOption("unassigned", "Unassigned - Issues with no assignee")
					.addOption("any-assigned", "Any assigned - Issues with any assignee")
					.setValue(repo.assigneeFilterMode ?? "assigned-to-me")
					.onChange(async (value) => {
						repo.assigneeFilterMode = value as "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned";
						assigneeSpecificContainer.classList.toggle(
							"github-issues-settings-hidden",
							value !== "assigned-to-specific",
						);
						await this.plugin.saveSettings();
					}),
			);

		const assigneeSpecificContainer = assigneeFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		assigneeSpecificContainer.classList.toggle(
			"github-issues-settings-hidden",
			(repo.assigneeFilterMode ?? "assigned-to-me") !== "assigned-to-specific",
		);

		new Setting(assigneeSpecificContainer)
			.setName("Specific assignees")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text
					.setPlaceholder("username1, username2, username3")
					.setValue((repo.assigneeFilters || []).join(", "))
					.onChange(async (value) => {
						repo.assigneeFilters = value
							.split(",")
							.map(username => username.trim())
							.filter(username => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip("Load collaborators from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea) {
							await this.fetchAndShowRepositoryCollaborators(repo.repository, repo, 'assigneeFilters', textArea);
						}
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Default: Allow issue deletion")
			.setDesc(
				"If enabled, issue files will be set to be deleted from your vault when the issue is closed or no longer matches your filter criteria",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.allowDeleteIssue)
					.onChange(async (value) => {
						repo.allowDeleteIssue = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Issue note template")
			.setDesc(
				"Template for issue note filenames. Available variables: {title}, {number}, {status}, {author}, {assignee}, {labels}, {repository}, {owner}, {repoName}, {type}, {created}, {updated}. Example: \"{title} - Issue {number}\""
			)
			.addText((text) =>
				text
					.setPlaceholder("Issue - {number}")
					.setValue(repo.issueNoteTemplate || "Issue - {number}")
					.onChange(async (value) => {
						repo.issueNoteTemplate = value || "Issue - {number}";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(issuesSettingsContainer)
			.setName("Use custom issue content template")
			.setDesc("Enable custom template file for issue content instead of the default format")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomIssueContentTemplate)
					.onChange(async (value) => {
						repo.useCustomIssueContentTemplate = value;
						customIssueTemplateContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		// Create the custom template container
		const customIssueTemplateContainer = issuesSettingsContainer.createDiv(
			"github-issues-settings-group",
		);
		customIssueTemplateContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.useCustomIssueContentTemplate,
		);

		new Setting(customIssueTemplateContainer)
			.setName("Issue content template file")
			.setDesc("Path to a markdown file that will be used as template for issue content. See /templates folder for examples.")
			.addText((text) => {
				text
					.setPlaceholder("templates/default-issue-template.md")
					.setValue(repo.issueContentTemplate || "")
					.onChange(async (value) => {
						repo.issueContentTemplate = value;
						await this.plugin.saveSettings();
					});

				// Add file suggestion functionality
				new FileSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📄")
					.setTooltip("Browse template files")
					.onClick(() => {
						// The file suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(issuesSettingsContainer)
			.setName("Include issue comments")
			.setDesc(
				"If enabled, comments from issues will be included in the generated files",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.includeIssueComments)
					.onChange(async (value) => {
						repo.includeIssueComments = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderPullRequestSettings(
		container: HTMLElement,
		repo: RepositoryTracking,
	): void {
		new Setting(container).setName("Pull requests").setHeading();

		container
			.createEl("p", {
				text: "Configure how pull requests are tracked and stored",
			})
			.addClass("setting-item-description");

		const pullRequestsSettingsContainer = container.createDiv(
			"github-issues-settings-group",
		);

		// Container for the standard pull requests folder setting
		const standardPRFolderContainer = pullRequestsSettingsContainer.createDiv();

		// Container for the custom pull requests folder setting
		const customPRFolderContainer = pullRequestsSettingsContainer.createDiv();

		new Setting(container)
			.setName("Track pull requests")
			.setDesc(
				"Enable or disable pull request tracking for this repository",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.trackPullRequest)
					.onChange(async (value) => {
						repo.trackPullRequest = value;
						pullRequestsSettingsContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);
		pullRequestsSettingsContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.trackPullRequest,
		);

		// Update container visibility based on custom folder setting
		const updatePRContainerVisibility = () => {
			standardPRFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				repo.useCustomPullRequestFolder,
			);
			customPRFolderContainer.classList.toggle(
				"github-issues-settings-hidden",
				!repo.useCustomPullRequestFolder,
			);
		};

		const pullRequestsFolderSetting = new Setting(standardPRFolderContainer)
			.setName("Pull requests folder")
			.setDesc("The folder where pull request files will be stored")
			.addText((text) => {
				text
					.setPlaceholder("GitHub Pull Requests")
					.setValue(repo.pullRequestFolder)
					.onChange(async (value) => {
						repo.pullRequestFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(pullRequestsSettingsContainer)
			.setName("Use custom folder")
			.setDesc("Instead of organizing pull requests by Owner/Repository, place all pull requests in a custom folder")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomPullRequestFolder)
					.onChange(async (value) => {
						repo.useCustomPullRequestFolder = value;
						updatePRContainerVisibility();
						await this.plugin.saveSettings();
					});
			});

		new Setting(customPRFolderContainer)
			.setName("Custom pull requests folder")
			.setDesc("Specific folder path where all pull requests will be placed (overrides the folder structure)")
			.addText((text) => {
				text
					.setPlaceholder("e.g., Pull Requests, GitHub/All PRs")
					.setValue(repo.customPullRequestFolder)
					.onChange(async (value) => {
						repo.customPullRequestFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggestion functionality
				new FolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📁")
					.setTooltip("Browse folders")
					.onClick(() => {
						// The folder suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(pullRequestsSettingsContainer)
			.setName("Pull request update mode")
			.setDesc("How to handle updates to existing pull requests")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"none",
						"None - Don't update existing pull requests",
					)
					.addOption("update", "Update - Overwrite existing content")
					.addOption("append", "Append - Add new content at the end")
					.setValue(repo.pullRequestUpdateMode)
					.onChange(async (value) => {
						repo.pullRequestUpdateMode = value as
							| "none"
							| "update"
							| "append";
						await this.plugin.saveSettings();
					}),
			);

		// Label filtering settings for pull requests
		new Setting(pullRequestsSettingsContainer)
			.setName("Filter pull requests by labels")
			.setDesc("Enable filtering pull requests based on their labels")
			.addToggle((toggle) =>
				toggle
					.setValue(repo.enablePrLabelFilter ?? false)
					.onChange(async (value) => {
						repo.enablePrLabelFilter = value;
						prLabelFilterContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const prLabelFilterContainer = pullRequestsSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prLabelFilterContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(repo.enablePrLabelFilter ?? false),
		);

		new Setting(prLabelFilterContainer)
			.setName("PR label filter mode")
			.setDesc("Choose whether to include or exclude pull requests with the specified labels")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("include", "Include - Only show PRs with these labels")
					.addOption("exclude", "Exclude - Hide PRs with these labels")
					.setValue(repo.prLabelFilterMode ?? "include")
					.onChange(async (value) => {
						repo.prLabelFilterMode = value as "include" | "exclude";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(prLabelFilterContainer)
			.setName("PR label filters")
			.setDesc("Comma-separated list of labels to filter by (case-sensitive)")
			.addTextArea((text) => {
				text
					.setPlaceholder("bug, enhancement, help wanted")
					.setValue((repo.prLabelFilters || []).join(", "))
					.onChange(async (value) => {
						repo.prLabelFilters = value
							.split(",")
							.map(label => label.trim())
							.filter(label => label.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch available labels")
					.setTooltip("Load labels from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea) {
							await this.fetchAndShowRepositoryLabels(repo.repository, repo, 'prLabelFilters', textArea);
						}
					}),
			);

		// Assignee filtering settings for pull requests
		new Setting(pullRequestsSettingsContainer)
			.setName("Filter pull requests by assignees")
			.setDesc("Enable filtering pull requests based on who they are assigned to")
			.addToggle((toggle) =>
				toggle
					.setValue(repo.enablePrAssigneeFilter ?? false)
					.onChange(async (value) => {
						repo.enablePrAssigneeFilter = value;
						prAssigneeFilterContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value,
						);
						await this.plugin.saveSettings();
					}),
			);

		const prAssigneeFilterContainer = pullRequestsSettingsContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prAssigneeFilterContainer.classList.toggle(
			"github-issues-settings-hidden",
			!(repo.enablePrAssigneeFilter ?? false),
		);

		new Setting(prAssigneeFilterContainer)
			.setName("PR assignee filter mode")
			.setDesc("Choose how to filter pull requests by assignees")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("assigned-to-me", "Assigned to me - Only my PRs")
					.addOption("assigned-to-specific", "Assigned to specific users")
					.addOption("unassigned", "Unassigned - PRs with no assignee")
					.addOption("any-assigned", "Any assigned - PRs with any assignee")
					.setValue(repo.prAssigneeFilterMode ?? "assigned-to-me")
					.onChange(async (value) => {
						repo.prAssigneeFilterMode = value as "assigned-to-me" | "assigned-to-specific" | "unassigned" | "any-assigned";
						prAssigneeSpecificContainer.classList.toggle(
							"github-issues-settings-hidden",
							value !== "assigned-to-specific",
						);
						await this.plugin.saveSettings();
					}),
			);

		const prAssigneeSpecificContainer = prAssigneeFilterContainer.createDiv(
			"github-issues-settings-group github-issues-nested",
		);
		prAssigneeSpecificContainer.classList.toggle(
			"github-issues-settings-hidden",
			(repo.prAssigneeFilterMode ?? "assigned-to-me") !== "assigned-to-specific",
		);

		new Setting(prAssigneeSpecificContainer)
			.setName("Specific PR assignees")
			.setDesc("Comma-separated list of GitHub usernames to filter by")
			.addTextArea((text) => {
				text
					.setPlaceholder("username1, username2, username3")
					.setValue((repo.prAssigneeFilters || []).join(", "))
					.onChange(async (value) => {
						repo.prAssigneeFilters = value
							.split(",")
							.map(username => username.trim())
							.filter(username => username.length > 0);
						await this.plugin.saveSettings();
					});

				return text;
			})
			.addButton((button) =>
				button
					.setButtonText("Fetch collaborators")
					.setTooltip("Load collaborators from this repository to help with configuration")
					.onClick(async () => {
						const textArea = button.buttonEl.closest('.setting-item')?.querySelector('textarea');
						if (textArea) {
							await this.fetchAndShowRepositoryCollaborators(repo.repository, repo, 'prAssigneeFilters', textArea);
						}
					}),
			);

		new Setting(pullRequestsSettingsContainer)
			.setName("Pull request note template")
			.setDesc(
				"Template for pull request note filenames. Available variables: {title}, {number}, {status}, {author}, {assignee}, {labels}, {repository}, {owner}, {repoName}, {type}, {created}, {updated}. Example: \"{title} - PR {number}\""
			)
			.addText((text) =>
				text
					.setPlaceholder("PR - {number}")
					.setValue(repo.pullRequestNoteTemplate || "PR - {number}")
					.onChange(async (value) => {
						repo.pullRequestNoteTemplate = value || "PR - {number}";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(pullRequestsSettingsContainer)
			.setName("Use custom pull request content template")
			.setDesc("Enable custom template file for pull request content instead of the default format")
			.addToggle((toggle) => {
				toggle
					.setValue(repo.useCustomPullRequestContentTemplate)
					.onChange(async (value) => {
						repo.useCustomPullRequestContentTemplate = value;
						customPRTemplateContainer.classList.toggle(
							"github-issues-settings-hidden",
							!value
						);
						await this.plugin.saveSettings();
					});
			});

		// Create the custom template container
		const customPRTemplateContainer = pullRequestsSettingsContainer.createDiv(
			"github-issues-settings-group",
		);
		customPRTemplateContainer.classList.toggle(
			"github-issues-settings-hidden",
			!repo.useCustomPullRequestContentTemplate,
		);

		new Setting(customPRTemplateContainer)
			.setName("Pull request content template file")
			.setDesc("Path to a markdown file that will be used as template for pull request content. See /templates folder for examples.")
			.addText((text) => {
				text
					.setPlaceholder("templates/default-pr-template.md")
					.setValue(repo.pullRequestContentTemplate || "")
					.onChange(async (value) => {
						repo.pullRequestContentTemplate = value;
						await this.plugin.saveSettings();
					});

				// Add file suggestion functionality
				new FileSuggest(this.app, text.inputEl);
			})
			.addButton((button) => {
				button
					.setButtonText("📄")
					.setTooltip("Browse template files")
					.onClick(() => {
						// The file suggest will be triggered when user types
						const inputEl = button.buttonEl.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.focus();
						}
					});
			});

		new Setting(pullRequestsSettingsContainer)
			.setName("Default: Allow pull request deletion")
			.setDesc(
				"If enabled, pull request files will be set to be deleted from your vault when the pull request is closed or no longer matches your filter criteria",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(repo.allowDeletePullRequest)
					.onChange(async (value) => {
						repo.allowDeletePullRequest = value;
						await this.plugin.saveSettings();
					}),
			);

		// Set initial visibility
		updatePRContainerVisibility();
	}

	private async renderAvailableRepositories(
		container: HTMLElement,
	): Promise<void> {
		container.empty();


		try {
			const repos = await this.plugin.fetchAvailableRepositories();

			const untrackedRepos = repos.filter((repo) => {
				const repoName = `${repo.owner.login}/${repo.name}`;
				return !this.plugin.settings.repositories.some(
					(r) => r.repository === repoName,
				);
			});

			container.empty();

			const actionsBar = container.createDiv("github-issues-actions-bar");

			const bulkActionsContainer = actionsBar.createDiv(
				"github-issues-bulk-actions",
			);
			bulkActionsContainer.addClass(
				"github-issues-bulk-actions-container",
			);

			const selectionControls = bulkActionsContainer.createDiv(
				"github-issues-selection-controls",
			);
			const selectAllButton = selectionControls.createEl("button");
			const selectAllIcon = selectAllButton.createEl("span", {
				cls: "github-issues-button-icon",
			});
			setIcon(selectAllIcon, "check");
			selectAllButton.createEl("span", {
				cls: "github-issues-button-text",
				text: "Select all",
			});
			selectAllButton.addClass("github-issues-select-all-button");
			const selectNoneButton = selectionControls.createEl("button");
			const selectNoneIcon = selectNoneButton.createEl("span", {
				cls: "github-issues-button-icon",
			});
			setIcon(selectNoneIcon, "x");
			selectNoneButton.createEl("span", {
				cls: "github-issues-button-text",
				text: "Select none",
			});
			selectNoneButton.addClass("github-issues-select-none-button");
			const addSelectedButton = bulkActionsContainer.createEl("button");
			addSelectedButton.createEl("span", {
				cls: "github-issues-button-icon",
				text: "+",
			});
			const buttonTextContainer = addSelectedButton.createEl("span", {
				cls: "github-issues-button-text",
			});
			buttonTextContainer.setText("Add Selected (");
			buttonTextContainer.createEl("span", {
				cls: "selected-count",
				text: "0",
			});
			buttonTextContainer.appendText(")");
			addSelectedButton.addClass("github-issues-add-selected-button");
			addSelectedButton.disabled = true;

			const searchContainer = actionsBar.createDiv(
				"github-issues-search-container",
			);
			searchContainer.addClass("github-issues-search-modern");

			const searchInputWrapper = searchContainer.createDiv(
				"github-issues-search-wrapper",
			);
			const searchIconContainer = searchInputWrapper.createDiv(
				"github-issues-search-icon",
			);
			setIcon(searchIconContainer, "search");

			const searchInput = searchInputWrapper.createEl("input");
			searchInput.type = "text";
			searchInput.placeholder = "Search repositories...";
			searchInput.addClass("github-issues-search-input-modern");
			const clearButton = searchInputWrapper.createDiv(
				"github-issues-clear-button github-issues-hidden",
			);
			setIcon(clearButton, "x");
			clearButton.addEventListener("click", () => {
				searchInput.value = "";
				clearButton.classList.add("github-issues-hidden");
				searchInput.dispatchEvent(new Event("input"));
				searchInput.focus();
			});

			const statsCounter = searchContainer.createDiv(
				"github-issues-stats-counter",
			);

			statsCounter.setText(`Showing all ${repos.length} repositories`);
			const repoListContainer = container.createDiv(
				"github-issues-repo-list",
			);
			const noResultsMessage = container.createDiv(
				"github-issues-no-results",
			);
			const noResultsIcon = noResultsMessage.createDiv(
				"github-issues-no-results-icon",
			);
			setIcon(noResultsIcon, "minus-circle");
			const noResultsText = noResultsMessage.createDiv(
				"github-issues-no-results-text",
			);
			noResultsText.setText("No matching repositories found");
			noResultsMessage.addClass("github-issues-hidden");

			const reposByOwner: Record<
				string,
				{ owner: string; repos: any[] }
			> = {};
			for (const repo of repos) {
				const ownerName = repo.owner.login;
				if (!reposByOwner[ownerName]) {
					reposByOwner[ownerName] = {
						owner: ownerName,
						repos: [],
					};
				}
				reposByOwner[ownerName].repos.push(repo);
			}

			const sortedOwners = Object.keys(reposByOwner).sort();

			const updateSelectionUI = () => {
				const selectedCount = this.selectedRepositories.size;
				const selectedCountSpan = addSelectedButton.querySelector(
					".selected-count",
				) as HTMLElement;
				if (selectedCountSpan) {
					selectedCountSpan.textContent = selectedCount.toString();
				}
				addSelectedButton.disabled = selectedCount === 0;
			};

			for (const ownerName of sortedOwners) {
				const ownerData = reposByOwner[ownerName];
				const ownerContainer = repoListContainer.createDiv();
				ownerContainer.addClass("github-issues-repo-owner-group");
				ownerContainer.setAttribute(
					"data-owner",
					ownerName.toLowerCase(),
				);
				const ownerHeader = ownerContainer.createDiv(
					"github-issues-repo-owner-header",
				);

				// Chevron icon for collapse/expand
				const chevronIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-chevron",
				});
				setIcon(chevronIcon, "chevron-right");

				const ownerIcon = ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-icon",
				});
				setIcon(ownerIcon, "user");
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-owner-name",
					text: ownerName,
				});
				ownerHeader.createEl("span", {
					cls: "github-issues-repo-count",
					text: ownerData.repos.length.toString(),
				});

				ownerData.repos.sort((a, b) => a.name.localeCompare(b.name));

				const reposContainer = ownerContainer.createDiv(
					"github-issues-owner-repos",
				);

				// Make owner header collapsible
				ownerHeader.addEventListener("click", (e) => {
					e.stopPropagation();
					const isExpanded = ownerContainer.classList.contains("github-issues-owner-expanded");
					if (isExpanded) {
						ownerContainer.classList.remove("github-issues-owner-expanded");
						setIcon(chevronIcon, "chevron-right");
					} else {
						ownerContainer.classList.add("github-issues-owner-expanded");
						setIcon(chevronIcon, "chevron-down");
					}
				});

				// Add repository items
				for (const repo of ownerData.repos) {
					const repoName = `${repo.owner.login}/${repo.name}`;
					const isTracked = this.plugin.settings.repositories.some(
						(r) => r.repository === repoName,
					);

					const repoItem = reposContainer.createDiv();
					repoItem.addClass("github-issues-item");
					repoItem.setAttribute(
						"data-repo-name",
						repo.name.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-owner-name",
						repo.owner.login.toLowerCase(),
					);
					repoItem.setAttribute(
						"data-full-name",
						repoName.toLowerCase(),
					);

					const repoInfoContainer = repoItem.createDiv(
						"github-issues-repo-info",
					);

					if (!isTracked) {
						const checkboxContainer = repoInfoContainer.createDiv(
							"github-issues-repo-checkbox",
						);
						const checkbox = checkboxContainer.createEl("input");
						checkbox.type = "checkbox";
						checkbox.addClass("github-issues-checkbox");
						checkbox.checked =
							this.selectedRepositories.has(repoName);

						checkbox.addEventListener("change", () => {
							if (checkbox.checked) {
								this.selectedRepositories.add(repoName);
							} else {
								this.selectedRepositories.delete(repoName);
							}
							updateSelectionUI();
						});
					}
					const repoIcon = repoInfoContainer.createDiv(
						"github-issues-repo-icon",
					);
					setIcon(repoIcon, "github");

					const repoText = repoInfoContainer.createEl("span");
					repoText.setText(repo.name);
					repoText.addClass("github-issues-repo-name");

					const actionContainer = repoItem.createDiv(
						"github-issues-repo-action",
					);
					if (isTracked) {
						const trackedContainer = actionContainer.createDiv(
							"github-issues-tracked-container",
						);
						setIcon(trackedContainer, "check");
						const trackedText = trackedContainer.createEl("span");
						trackedText.setText("Tracked");
						trackedText.addClass("github-issues-info-text");
					}
				}
			}

			selectAllButton.onclick = () => {
				const checkboxes = repoListContainer.querySelectorAll(
					'.github-issues-checkbox:not([data-tracked="true"])',
				) as NodeListOf<HTMLInputElement>;
				checkboxes.forEach((checkbox) => {
					const repoItem = checkbox.closest(".github-issues-item");
					if (
						repoItem &&
						!repoItem.classList.contains("github-issues-hidden")
					) {
						checkbox.checked = true;
						const repoName = repoItem
							.getAttribute("data-full-name")
							?.replace(/\s+/g, "");
						if (repoName) {
							const ownerName =
								repoItem.getAttribute("data-owner-name");
							const repoNameOnly =
								repoItem.getAttribute("data-repo-name");
							if (ownerName && repoNameOnly) {
								const fullRepoName = `${ownerName}/${repoNameOnly}`;
								this.selectedRepositories.add(fullRepoName);
							}
						}
					}
				});
				updateSelectionUI();
			};

			selectNoneButton.onclick = () => {
				const checkboxes = repoListContainer.querySelectorAll(
					".github-issues-checkbox",
				) as NodeListOf<HTMLInputElement>;
				checkboxes.forEach((checkbox) => {
					checkbox.checked = false;
				});
				this.selectedRepositories.clear();
				updateSelectionUI();
			};

			addSelectedButton.onclick = async () => {
				if (this.selectedRepositories.size > 0) {
					const selectedRepos = Array.from(this.selectedRepositories);
					await this.addMultipleRepositories(selectedRepos);
					await this.renderAvailableRepositories(container);
				}
			};

			searchInput.addEventListener("input", () => {
				const searchTerm = searchInput.value.toLowerCase();

				if (searchTerm.length > 0) {
					clearButton.classList.remove("github-issues-hidden");
				} else {
					clearButton.classList.add("github-issues-hidden");
				}

				const repoItems = repoListContainer.querySelectorAll(
					".github-issues-item",
				);
				let visibleCount = 0;
				const visibleReposByOwner: Record<string, number> = {};

				repoItems.forEach((item) => {
					const repoName = item.getAttribute("data-repo-name") || "";
					const ownerName =
						item.getAttribute("data-owner-name") || "";
					const fullName = item.getAttribute("data-full-name") || "";

					if (
						fullName.includes(searchTerm) ||
						repoName.includes(searchTerm) ||
						ownerName.includes(searchTerm)
					) {
						(item as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
						visibleCount++;
						if (!visibleReposByOwner[ownerName]) {
							visibleReposByOwner[ownerName] = 0;
						}
						visibleReposByOwner[ownerName]++;
					} else {
						(item as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				const ownerGroups = repoListContainer.querySelectorAll(
					".github-issues-repo-owner-group",
				);
				ownerGroups.forEach((group) => {
					const ownerName = group.getAttribute("data-owner") || "";

					if (
						visibleReposByOwner[ownerName] &&
						visibleReposByOwner[ownerName] > 0
					) {
						(group as HTMLElement).classList.remove(
							"github-issues-hidden",
						);
					} else {
						(group as HTMLElement).classList.add(
							"github-issues-hidden",
						);
					}
				});

				if (searchTerm.length > 0) {
					statsCounter.setText(
						`Showing ${visibleCount} of ${repos.length} repositories`,
					);
				} else {
					statsCounter.setText(
						`Showing all ${repos.length} repositories`,
					);
				}

				noResultsMessage.classList.toggle(
					"github-issues-hidden",
					visibleCount > 0,
				);
			});

			updateSelectionUI();
		} catch (error) {
			container.empty();
			container.createEl("p", {
				text: `Error loading repositories: ${(error as Error).message}`,
			});
		}
	}

	/**
	 * Fetch and display available labels for a repository
	 */
	private async fetchAndShowRepositoryLabels(
		repositoryName: string,
		repo: RepositoryTracking,
		filterType: 'labelFilters' | 'prLabelFilters',
		textAreaElement: HTMLTextAreaElement,
	): Promise<void> {
		if (!this.plugin.gitHubClient?.isReady()) {
			new Notice("GitHub client not ready. Please set your GitHub token first.");
			return;
		}

		const [owner, repoName] = repositoryName.split("/");
		if (!owner || !repoName) {
			new Notice("Invalid repository format. Expected 'owner/repo'.");
			return;
		}

		try {
			new Notice("Fetching labels from repository...");
			const labels = await this.plugin.gitHubClient.fetchRepositoryLabels(owner, repoName);

			if (labels.length === 0) {
				new Notice("No labels found in this repository.");
				return;
			}

			// Create a modal to show available labels
			const modal = new Modal(this.app);
			modal.titleEl.setText(`Available Labels for ${repositoryName}`);
			modal.containerEl.addClass("github-issues-modal");

			const contentContainer = modal.contentEl.createDiv("github-issues-labels-modal");

			const description = contentContainer.createEl("p", {
				text: `Found ${labels.length} labels in this repository. Click on labels to add them to your filter:`,
			});
			description.addClass("github-issues-modal-description");

			const labelsContainer = contentContainer.createDiv("github-issues-labels-container");

			labels.forEach((label: any) => {
				const labelElement = labelsContainer.createDiv("github-issues-label-item");

				const labelBadge = labelElement.createDiv("github-issues-label-badge");
				labelBadge.setText(label.name);

				// Set color as CSS custom properties instead of direct style assignment
				labelBadge.style.setProperty('--label-bg-color', `#${label.color}`);
				labelBadge.style.setProperty('--label-text-color', this.getContrastColor(label.color));

				if (label.description) {
					const description = labelElement.createDiv("github-issues-label-description");
					description.setText(label.description);
				}

				const currentFilters = repo[filterType] ?? [];
				const isSelected = currentFilters.includes(label.name);
				labelElement.classList.toggle("github-issues-label-selected", isSelected);

				labelElement.addEventListener("click", async () => {
					const currentFilters = repo[filterType] ?? [];
					if (currentFilters.includes(label.name)) {
						// Remove label
						repo[filterType] = currentFilters.filter((l: string) => l !== label.name);
						labelElement.classList.remove("github-issues-label-selected");
					} else {
						// Add label
						repo[filterType] = [...currentFilters, label.name];
						labelElement.classList.add("github-issues-label-selected");
					}

					// Update the textarea and save settings
					textAreaElement.value = repo[filterType].join(", ");
					await this.plugin.saveSettings();
				});
			});

			const buttonContainer = contentContainer.createDiv("github-issues-button-container");
			const closeButton = buttonContainer.createEl("button", { text: "Close" });
			closeButton.onclick = () => modal.close();

			modal.open();
			new Notice(`Loaded ${labels.length} labels from ${repositoryName}`);
		} catch (error) {
			new Notice(`Error fetching labels: ${(error as Error).message}`);
		}
	}

	/**
	 * Fetch and display available collaborators for a repository
	 */
	private async fetchAndShowRepositoryCollaborators(
		repositoryName: string,
		repo: RepositoryTracking,
		filterType: 'assigneeFilters' | 'prAssigneeFilters',
		textAreaElement: HTMLTextAreaElement,
	): Promise<void> {
		if (!this.plugin.gitHubClient?.isReady()) {
			new Notice("GitHub client not ready. Please set your GitHub token first.");
			return;
		}

		const [owner, repoName] = repositoryName.split("/");
		if (!owner || !repoName) {
			new Notice("Invalid repository format. Expected 'owner/repo'.");
			return;
		}

		try {
			new Notice("Fetching collaborators from repository...");
			const collaborators = await this.plugin.gitHubClient.fetchRepositoryCollaborators(owner, repoName);

			if (collaborators.length === 0) {
				new Notice("No collaborators found in this repository.");
				return;
			}

			// Create a modal to show available collaborators
			const modal = new Modal(this.app);
			modal.titleEl.setText(`Available Collaborators for ${repositoryName}`);
			modal.containerEl.addClass("github-issues-modal");

			const contentContainer = modal.contentEl.createDiv("github-issues-collaborators-modal");

			const description = contentContainer.createEl("p", {
				text: `Found ${collaborators.length} collaborators in this repository. Click on users to add them to your filter:`,
			});
			description.addClass("github-issues-modal-description");

			const collaboratorsContainer = contentContainer.createDiv("github-issues-collaborators-container");

			const currentFilters = repo[filterType] ?? [];

			collaborators.forEach((collaborator: any) => {
				const collaboratorElement = collaboratorsContainer.createDiv("github-issues-collaborator-item");

				const avatarContainer = collaboratorElement.createDiv("github-issues-collaborator-avatar");
				if (collaborator.avatar_url) {
					const avatar = avatarContainer.createEl("img");
					avatar.src = collaborator.avatar_url;
					avatar.alt = collaborator.login;
					avatar.addClass("github-issues-avatar");
				}

				const infoContainer = collaboratorElement.createDiv("github-issues-collaborator-info");

				const username = infoContainer.createDiv("github-issues-collaborator-username");
				username.setText(collaborator.login);

				if (collaborator.type) {
					const type = infoContainer.createDiv("github-issues-collaborator-type");
					type.setText(collaborator.type);
				}

				const isSelected = currentFilters.includes(collaborator.login);
				collaboratorElement.classList.toggle("github-issues-collaborator-selected", isSelected);

				collaboratorElement.addEventListener("click", async () => {
					if (currentFilters.includes(collaborator.login)) {
						// Remove collaborator
						repo[filterType] = currentFilters.filter((username: string) => username !== collaborator.login);
						collaboratorElement.classList.remove("github-issues-collaborator-selected");
					} else {
						// Add collaborator
						repo[filterType] = [...currentFilters, collaborator.login];
						collaboratorElement.classList.add("github-issues-collaborator-selected");
					}

					// Update the textarea and save settings
					textAreaElement.value = repo[filterType].join(", ");
					await this.plugin.saveSettings();
				});
			});

			const buttonContainer = contentContainer.createDiv("github-issues-button-container");
			const closeButton = buttonContainer.createEl("button", { text: "Close" });
			closeButton.onclick = () => modal.close();

			modal.open();
			new Notice(`Loaded ${collaborators.length} collaborators from ${repositoryName}`);
		} catch (error) {
			new Notice(`Error fetching collaborators: ${(error as Error).message}`);
		}
	}

	/**
	 * Calculate contrast color for text based on background color
	 */
	private getContrastColor(hexColor: string): string {
		const r = parseInt(hexColor.substr(0, 2), 16);
		const g = parseInt(hexColor.substr(2, 2), 16);
		const b = parseInt(hexColor.substr(4, 2), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;
		return brightness > 128 ? "#000000" : "#ffffff";
	}

	/**
	 * Update the token status badge
	 */
	private addTemplateVariablesHelp(container: HTMLElement, type: 'issue' | 'pr'): void {
		const helpContainer = container.createDiv("github-issues-template-help");

		const details = helpContainer.createEl("details");
		const summary = details.createEl("summary");
		summary.textContent = "Available template variables";
		summary.addClass("github-issues-template-help-summary");

		const variablesContainer = details.createDiv("github-issues-template-variables");

		// Use the getTemplateHelp function and render as pre-formatted text
		const helpText = variablesContainer.createEl("pre");
		helpText.textContent = getTemplateHelp();
	}

	private async updateTokenBadge(container?: HTMLElement): Promise<void> {
		const badgeContainer = container || this.containerEl.querySelector(".github-issues-token-badge-container") as HTMLElement;
		if (!badgeContainer) return;

		badgeContainer.empty();

		if (!this.plugin.settings.githubToken) {
			const badge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-invalid");
			badge.setText("No token");
			return;
		}

		if (!this.plugin.gitHubClient) {
			const badge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-error");
			badge.setText("Client not initialized");
			return;
		}

		// Show loading state
		const loadingBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-loading");
		loadingBadge.setText("Validating token...");

		try {
			// Initialize client with current token
			this.plugin.gitHubClient.initializeClient(this.plugin.settings.githubToken);

			// Validate token and get information
			const [tokenInfo, rateLimit] = await Promise.all([
				this.plugin.gitHubClient.validateToken(),
				this.plugin.gitHubClient.getRateLimit()
			]);

			// Clear loading state
			badgeContainer.empty();

			if (tokenInfo.valid) {
				// Valid token badge
				const validBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-valid");
				validBadge.setText("✓ Valid token");

				// Scopes badge
				if (tokenInfo.scopes.length > 0) {
					const scopesBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-scopes");
					scopesBadge.setText(`Scopes: ${tokenInfo.scopes.join(", ")}`);
				}

				// Rate limit badge
				if (rateLimit) {
					const rateLimitBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-rate-limit");
					rateLimitBadge.setText(`Rate Limit: ${rateLimit.remaining}/${rateLimit.limit}`);
				}
			} else {
				const invalidBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-invalid");
				invalidBadge.setText("✗ Invalid token");
			}
		} catch (error) {
			// Clear loading state and show error
			badgeContainer.empty();
			const errorBadge = badgeContainer.createDiv("github-issues-token-badge github-issues-token-badge-error");
			errorBadge.setText("Error validating token");
		}
	}
}

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

export class GitHubTrackerSettingTab extends PluginSettingTab {
	private selectedRepositories: Set<string> = new Set();

	constructor(
		app: App,
		private plugin: GitHubTrackerPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass("github-issues");

		new Setting(containerEl)
			.setName("GitHub token")
			.setDesc("Your GitHub personal access token")
			.addText((text) =>
				text
					.setPlaceholder("Enter your GitHub token")
					.setValue(this.plugin.settings.githubToken)
					.onChange(async (value) => {
						this.plugin.settings.githubToken = value;
						await this.plugin.saveSettings();
					}),
			);
		const tokenInfo = containerEl.createEl("p", {
			text: "Please limit the token to the minimum permissions needed. For more information. Requirements are Issues, Pull Requests, and Repositories. Read more ",
		});
		tokenInfo.addClass("github-issues-info-text");

		new Setting(containerEl)
			.setName("Sync on startup")
			.setDesc(
				"Automatically sync issues and pull requests when Obsidian starts",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.syncOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Enable background sync")
			.setDesc(
				"Automatically sync issues and pull requests periodically in the background.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBackgroundSync)
					.onChange(async (value) => {
						this.plugin.settings.enableBackgroundSync = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh settings tab to show/hide interval
					}),
			);

		new Setting(containerEl)
			.setName("Days to keep closed items for cleanup check")
			.setDesc(
				"When checking for issues/PRs to delete locally, items closed more recently than this number of days will be considered. Affects cleanup when 'Allow issue/PR deletion' is enabled.",
			)
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(
						this.plugin.settings.cleanupClosedIssuesDays.toString(),
					)
					.onChange(async (value) => {
						let numValue = parseInt(value, 10);
						if (isNaN(numValue) || numValue < 1) {
							numValue = 1; // Minimum 1 day
							this.plugin.showNotice(
								"Cleanup check for closed items set to minimum 1 day.",
								"warning",
							);
						}
						this.plugin.settings.cleanupClosedIssuesDays = numValue;
						await this.plugin.saveSettings();
					}),
			);

		if (this.plugin.settings.enableBackgroundSync) {
			new Setting(containerEl)
				.setName("Background sync interval (minutes)")
				.setDesc(
					"How often to sync in the background. Minimum 5 minutes.",
				)
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

		new Setting(containerEl)
			.setName("Sync notice mode")
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

		new Setting(containerEl)
			.setName("Date format")
			.setDesc(
				"Format for dates in issue files (e.g., yyyy-MM-dd HH:mm:ss)",
			)
			.addText((text) =>
				text
					.setPlaceholder("yyyy-MM-dd HH:mm:ss")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Body content escaping")
			.setDesc(
				"Choose how to handle Templater, Dataview and other plugin escaping in issue and pull request bodies.",
			)
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
						"Strict - Only alphanumeric characters and links will be allowed",
					)
					.addOption(
						"veryStrict",
						"Very strict - Only alphanumeric characters, and punctuation",
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

		const infoText = containerEl.createEl("p", {
			text: "CAUTION: especially if using Plugins that enable script execution. In disabled mode, no escaping will be done. ",
		});
		infoText.addClass("github-issues-info-text");
		infoText.addClass("github-issues-warning-text");

		const infoText2 = containerEl.createEl("p", {
			text: "In normal mode '`', '{{', '}}', '<%' and '%>' will be escaped. (This has the side effect of not allowing code blocks to be rendered)",
		});
		infoText2.addClass("github-issues-info-text");

		const infoText3 = containerEl.createEl("p", {
			text: "In strict mode only alphanumeric characters, '.,'()/[]{}*+-:\"' and whitespace will be allowed. This will remove any html like rendering and templating, but persist links",
		});
		infoText3.addClass("github-issues-info-text");

		const infoText4 = containerEl.createEl("p", {
			text: "In very strict mode only alphanumeric characters, and '.,' or whitespace will be allowed. This will remove any html like rendering and templating.",
		});
		infoText4.addClass("github-issues-info-text");

		const infoLink = tokenInfo.createEl("a", {
			text: "here",
		});
		infoLink.addClass("github-issues-info-link");
		infoLink.href =
			"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token";
		infoLink.target = "_blank";

		containerEl.createEl("hr");
		const repoContainer = containerEl.createDiv();

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
		const addRepoIcon = manualAddHeaderContainer.createDiv(
			"github-issues-repo-add-icon",
		);
		setIcon(addRepoIcon, "plus-square");

		const addRepoHeading = manualAddHeaderContainer.createEl("h3", {
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

		const noTrackedRepos = trackedReposContent.createEl("p", {
			text: "No repositories tracked. Please add a repository to get started.",
		});
		noTrackedRepos.addClass("github-issues-no-repos");
		noTrackedRepos.classList.toggle(
			"github-issues-hidden",
			this.plugin.settings.repositories.length > 0,
		);

		const availableReposSearchContainer = availableReposContent.createDiv(
			"github-issues-available-search-container",
		);

		const githubCardContainer =
			availableReposSearchContainer.createDiv("github-issues-card");

		const cardHeader = githubCardContainer.createDiv(
			"github-issues-card-header",
		);
		// GitHub icon
		const githubIcon = cardHeader.createDiv("github-issues-github-icon");
		setIcon(githubIcon, "github");

		const cardTitle = cardHeader.createEl("h3");
		cardTitle.setText("GitHub Repositories");
		cardTitle.addClass("github-issues-card-title");

		const cardContent = githubCardContainer.createDiv(
			"github-issues-card-content",
		);

		const searchDescription = cardContent.createEl("p", {
			text: "Connect to GitHub to view and track your available repositories. Your repositories will be loaded directly from your GitHub account.",
		});
		searchDescription.addClass("github-issues-card-description");

		const actionContainer = githubCardContainer.createDiv(
			"github-issues-card-action",
		);

		const searchButton = actionContainer.createEl("button");
		searchButton.addClass("github-issues-action-button");
		// Create icon element for the search button
		const buttonIcon = searchButton.createEl("span", {
			cls: "github-issues-button-icon",
		});
		setIcon(buttonIcon, "refresh-cw");
		searchButton.createEl("span", { text: "Load GitHub Repositories" });

		const reposResultsContainer = availableReposContent.createDiv(
			"github-issues-repos-results-container",
		);
		reposResultsContainer.addClass("github-issues-hidden");

		searchButton.onclick = async () => {
			const buttonText = searchButton.querySelector("span");
			if (buttonText) {
				buttonText.textContent = "Loading...";
			}
			searchButton.setAttribute("disabled", "true");
			searchButton.addClass("github-issues-loading");

			await this.renderAvailableRepositories(reposResultsContainer);
			reposResultsContainer.addClass("github-issues-fade-out");
			reposResultsContainer.removeClass("github-issues-hidden");

			setTimeout(() => {
				reposResultsContainer.removeClass("github-issues-fade-out");
				reposResultsContainer.addClass("github-issues-fade-in");
			}, 10);

			if (buttonText) {
				buttonText.textContent = "Refresh repositories";
			}

			const spinnerIcon = searchButton.querySelector(
				".github-issues-button-spinner",
			);
			if (spinnerIcon && spinnerIcon instanceof HTMLElement) {
				setIcon(spinnerIcon, "refresh-cw");
			}

			searchButton.removeAttribute("disabled");
			searchButton.removeClass("github-issues-loading");
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

		const loadingContainer = container.createDiv(
			"github-issues-loading-container",
		);
		const loadingSpinner = loadingContainer.createDiv(
			"github-issues-loading-spinner",
		);
		setIcon(loadingSpinner, "loader-2");
		loadingSpinner.addClass("github-issues-spinner");

		loadingContainer
			.createEl("p", {
				text: "Loading repositories from GitHub...",
			})
			.addClass("github-issues-loading-text");

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
}

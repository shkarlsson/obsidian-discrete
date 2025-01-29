import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

import { MetadataFilterSettings, MetadataFilter, DEFAULT_SETTINGS } from './types';

export default class MetadataFilterPlugin extends Plugin {
	settings: MetadataFilterSettings;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new MetadataFilterSettingTab(this.app, this));

		// Register file explorer view extension
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				menu.addItem((item) => {
					item
						.setTitle('Filter by metadata')
						.setIcon('filter')
						.onClick(async () => {
							if (file instanceof TFile) {
								const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
								if (metadata) {
									await this.filterByMetadata(metadata);
								}
							}
						});
				});
			})
		);

		// Register file explorer filter
		this.registerEvent(
			this.app.workspace.on('file-explorer:create', () => {
				if (this.settings.enableExplorerFilter && this.settings.filters.length > 0) {
					this.applyFiltersToExplorer();
				}
			})
		);

		// Apply filters when files are modified
		this.registerEvent(
			this.app.vault.on('modify', () => {
				if (this.settings.enableExplorerFilter && this.settings.filters.length > 0) {
					this.applyFiltersToExplorer();
				}
			})
		);

		// Initial filter application - wait for file explorer to be ready
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.enableExplorerFilter && this.settings.filters.length > 0) {
				this.applyFiltersToExplorer();
			}
		});

		// Register search result filter
		this.registerEvent(
			this.app.workspace.on("search:results", (evt) => {
				if (!this.settings.enableSearchFilter || this.settings.filters.length === 0) {
					return;
				}

				const results = evt?.results;
				if (!results) return;

				for (const matchingFile of results.keys()) {
					if (!this.shouldFileBeVisible(matchingFile)) {
						results.delete(matchingFile);
					}
				}
			})
		);

		// Register Omnisearch event handler
		this.registerEvent(
			// @ts-ignore - Omnisearch types aren't available
			this.app.workspace.on("omnisearch:search-results", (evt: Events) => {
				if (!this.settings.enableOmnisearchFilter || this.settings.filters.length === 0) {
					return;
				}

				// Filter out results for files that shouldn't be visible
				if (evt?.results) {
					evt.results = evt.results.filter(result => {
						if (result.file) {
							return this.shouldFileBeVisible(result.file);
						}
						return true;
					});
				}
			})
		);

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		// Save settings first
		await this.saveData(this.settings);
	}

	async filterByMetadata(metadata: any) {
		const key = Object.keys(metadata)[0];
		const value = metadata[key];
		
		const filter: MetadataFilter = {
			key: key,
			value: value.toString(),
			operator: Array.isArray(value) ? 'includes' : 
					 typeof value === 'number' ? 'equals' :
					 typeof value === 'boolean' ? 'equals' : 'contains',
			type: Array.isArray(value) ? 'array' :
				  typeof value === 'number' ? 'number' :
				  typeof value === 'boolean' ? 'boolean' : 'string'
		};
		
		this.settings.filters.push(filter);
		await this.saveSettings();
		
		// Refresh file explorer
		this.app.workspace.trigger('file-explorer:refresh');
	}

	evaluateFilter(metadata: any, filter: MetadataFilter): boolean {
		const value = metadata[filter.key];
		
		// For 'exists' operator, just check if the key exists and has a value
		if (filter.operator === 'exists') {
			return value !== undefined && value !== null;
		}
		
		// For all other operators, first check if value exists
		if (value === undefined || value === null) {
			return false;
		}
		
		switch (filter.operator) {
			case 'equals':
				// If value exists and matches, return true
				if (filter.type === 'number') {
					return Number(value) === Number(filter.value);
				}
				if (filter.type === 'boolean') {
					return String(value).toLowerCase() === filter.value.toLowerCase();
				}
				return String(value).toLowerCase() === filter.value.toLowerCase();
			case 'contains':
				return String(value).toLowerCase().includes(filter.value.toLowerCase());
			case 'includes':
				if (Array.isArray(value)) {
					return value.some(v => String(v).toLowerCase() === filter.value.toLowerCase());
				}
				return false;
			case 'greater':
				return Number(value) > Number(filter.value);
			case 'less':
				return Number(value) < Number(filter.value);
			default:
				return false;
		}
	}

	shouldFileBeVisible(file: TFile): boolean {
		const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
		
		// If no metadata and hideMatches is true, show the file
		// If no metadata and hideMatches is false, hide the file
		if (!metadata) {
			return this.settings.hideMatches;
		}

		// Evaluate filters for this file
		const matchesAll = this.settings.filters.every(f => this.evaluateFilter(metadata, f));
		const matchesAny = this.settings.filters.some(f => this.evaluateFilter(metadata, f));
		const matches = this.settings.combineWithAnd ? matchesAll : matchesAny;

		// If hideMatches is true, we hide matching files.
		// If hideMatches is false, we hide non-matching files.
		return this.settings.hideMatches ? !matches : matches;
	}

	async applyFiltersToExplorer() {
		const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		if (!fileExplorer) return;

		const files = this.app.vault.getMarkdownFiles();
		const visibleFiles = new Set<string>();

		for (const file of files) {
			const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
			
			// If no metadata and hideMatches is true, show the file
			// If no metadata and hideMatches is false, hide the file
			if (!metadata) {
				if (this.settings.hideMatches) {
					visibleFiles.add(file.path);
				}
				continue;
			}

			// Evaluate filters for this file
			const matchesAll = this.settings.filters.every(f => this.evaluateFilter(metadata, f));
			const matchesAny = this.settings.filters.some(f => this.evaluateFilter(metadata, f));
			const matches = this.settings.combineWithAnd ? matchesAll : matchesAny;

			// If hideMatches is true, we hide matching files.
			// If hideMatches is false, we hide non-matching files.
			const shouldBeVisible = this.settings.hideMatches ? !matches : matches;

			if (shouldBeVisible) {
				visibleFiles.add(file.path);
			}
		}

		// Apply CSS to hide non-matching files
		const style = document.createElement('style');
		style.id = 'metadata-filter-styles';
		const oldStyle = document.getElementById('metadata-filter-styles');
		if (oldStyle) oldStyle.remove();

		const fileItems = fileExplorer.view.fileItems;
		
		const hideRules = Object.keys(fileItems)
			.filter(path => !visibleFiles.has(path))
			.map(path => `.nav-file-title[data-path="${CSS.escape(path)}"] { display: none !important; }`)
			.join('\n');

		style.textContent = hideRules;
		document.head.appendChild(style);
	}

}

import { MetadataFilterSettingTab } from './settings';

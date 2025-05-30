import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

import { DiscreteSettings, DiscreteFilter, DEFAULT_SETTINGS } from './types';

export default class DiscretePlugin extends Plugin {
	settings: DiscreteSettings;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new DiscreteSettingTab(this.app, this));

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
			// @ts-ignore - 'file-explorer:create' is a valid event but not typed
			this.app.workspace.on('file-explorer:create', () => {
				if (this.settings.enableExplorerFilter && this.settings.filters.length > 0) {
					this.applyFiltersToExplorer();
				}
			})
		);

		// Register view-show event to handle switching to file explorer
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
				if (fileExplorer && this.settings.enableExplorerFilter && this.settings.filters.length > 0) {
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

		const filter: DiscreteFilter = {
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

	evaluateFilter(metadata: any, filter: DiscreteFilter): boolean {
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

		// Get file items safely
		// @ts-ignore - fileItems exists on the file explorer view but is not typed
		const fileItems = fileExplorer.view.fileItems;
		let hideRules = '';

		if (fileItems) {
			hideRules = Object.keys(fileItems)
				.filter(path => !visibleFiles.has(path))
				.map(path => `.nav-file-title[data-path="${CSS.escape(path)}"] { display: none !important; }`)
				.join('\n');
		}

		style.textContent = hideRules;
		document.head.appendChild(style);
	}

	onunload() {
		// Remove the metadata-filter-styles stylesheet
		const style = document.getElementById('metadata-filter-styles');
		if (style) style.remove();
	}
}

import { DiscreteSettingTab } from './settings';

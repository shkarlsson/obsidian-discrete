import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

interface MetadataFilterSettings {
	filters: MetadataFilter[];
}

interface MetadataFilter {
	key: string;
	value: string;
	operator: 'equals' | 'contains' | 'exists' | 'includes' | 'greater' | 'less';
	type: 'string' | 'number' | 'array' | 'boolean';
}

const DEFAULT_SETTINGS: MetadataFilterSettings = {
	filters: []
}

export default class MetadataFilterPlugin extends Plugin {
	settings: MetadataFilterSettings;

	async onload() {
		console.log('Loading MetadataFilter plugin...');
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new MetadataFilterSettingTab(this.app, this));
		console.log('MetadataFilter plugin settings loaded:', this.settings);

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
				this.applyFiltersToExplorer();
			})
		);

		// Apply filters when files are modified
		this.registerEvent(
			this.app.vault.on('modify', () => {
				if (this.settings.filters.length > 0) {
					this.applyFiltersToExplorer();
				}
			})
		);

		// Initial filter application
		if (this.settings.filters.length > 0) {
			this.applyFiltersToExplorer();
		}

		// Register search extension
		this.registerEvent(
			this.app.workspace.on('search:results-menu', (menu) => {
				menu.addItem((item) => {
					item
						.setTitle('Apply metadata filters')
						.setIcon('filter')
						.onClick(() => {
							this.applyFiltersToSearch();
						});
				});
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		// Increment version
		const manifest = JSON.parse(await this.app.vault.adapter.read('manifest.json'));
		const version = manifest.version.split('.');
		version[2] = (parseInt(version[2]) + 1).toString();
		manifest.version = version.join('.');
		await this.app.vault.adapter.write('manifest.json', JSON.stringify(manifest, null, '\t'));
		
		// Update package.json version to match
		const packageJson = JSON.parse(await this.app.vault.adapter.read('package.json'));
		packageJson.version = manifest.version;
		await this.app.vault.adapter.write('package.json', JSON.stringify(packageJson, null, '\t'));
		
		// Save settings
		await this.saveData(this.settings);
		
		console.log('Settings saved, version incremented to:', manifest.version);
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
		if (value === undefined) return false;
		
		switch (filter.operator) {
			case 'exists':
				return true;
			case 'equals':
				if (filter.type === 'number') {
					return Number(value) === Number(filter.value);
				}
				if (filter.type === 'boolean') {
					return String(value) === filter.value;
				}
				return String(value) === filter.value;
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

	async applyFiltersToExplorer() {
		const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		if (!fileExplorer) return;

		const files = this.app.vault.getMarkdownFiles();
		const visibleFiles = new Set<string>();

		for (const file of files) {
			const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!metadata) continue;

			let matchesAllFilters = true;
			for (const filter of this.settings.filters) {
				if (!this.evaluateFilter(metadata, filter)) {
					matchesAllFilters = false;
					break;
				}
			}

			if (matchesAllFilters) {
				visibleFiles.add(file.path);
			}
		}

		// Apply CSS to hide non-matching files
		const style = document.createElement('style');
		style.id = 'metadata-filter-styles';
		const oldStyle = document.getElementById('metadata-filter-styles');
		if (oldStyle) oldStyle.remove();

		const hideRules = Array.from(fileExplorer.view.fileItems.keys())
			.filter(path => !visibleFiles.has(path))
			.map(path => `.nav-file-title[data-path="${path}"] { display: none !important; }`)
			.join('\n');

		style.textContent = hideRules;
		document.head.appendChild(style);
	}

	async applyFiltersToSearch() {
		const searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
		if (searchLeaf) {
			const searchView = searchLeaf.view;
			const query = searchView.getQuery();
			
			// Add metadata filters to search query
			const filterQueries = this.settings.filters.map(filter => {
				return `path:"${filter.key}:${filter.value}"`;
			});
			
			searchView.setQuery(query + ' ' + filterQueries.join(' '));
		}
	}
}

class MetadataFilterSettingTab extends PluginSettingTab {
	plugin: MetadataFilterPlugin;

	constructor(app: App, plugin: MetadataFilterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Metadata Filter Settings'});

		// Add plugin information section
		const infoEl = containerEl.createDiv('metadata-filter-info');
		
		infoEl.createEl('p', {
			text: `Version: ${this.plugin.manifest.version}`,
			cls: 'metadata-filter-version'
		});
		
		infoEl.createEl('p', {
			text: `Created by: ${this.plugin.manifest.author}`,
			cls: 'metadata-filter-author'
		});

		containerEl.createEl('h3', {text: 'Filters'});

		this.plugin.settings.filters.forEach((filter, index) => {
			const filterContainer = containerEl.createDiv('metadata-filter-setting');
			
			// Create filter header
			const headerEl = filterContainer.createEl('h3', {
				text: `Filter ${index + 1}`,
				cls: 'metadata-filter-header'
			});

			// Key setting
			new Setting(filterContainer)
				.setName('Metadata Key')
				.setDesc('The frontmatter field to filter on')
				.addText(text => text
					.setPlaceholder('Enter key (e.g., tags, status)')
					.setValue(filter.key)
					.onChange(async (value) => {
						filter.key = value;
						await this.plugin.saveSettings();
					}));

			// Operator setting
			new Setting(filterContainer)
				.setName('Operator')
				.setDesc('How to compare the values')
				.addDropdown(dropdown => dropdown
					.addOptions({
						'equals': 'Equals exactly',
						'contains': 'Contains text',
						'exists': 'Field exists',
						'includes': 'Includes value (for arrays)',
						'greater': 'Greater than (for numbers)',
						'less': 'Less than (for numbers)'
					})
					.setValue(filter.operator)
					.onChange(async (value: any) => {
						filter.operator = value;
						await this.plugin.saveSettings();
						// Refresh to show/hide value field
						this.display();
					}));

			// Type setting
			new Setting(filterContainer)
				.setName('Value Type')
				.setDesc('The type of value to compare')
				.addDropdown(dropdown => dropdown
					.addOptions({
						'string': 'Text',
						'number': 'Number',
						'array': 'List/Array',
						'boolean': 'Yes/No'
					})
					.setValue(filter.type || 'string')
					.onChange(async (value: any) => {
						filter.type = value;
						await this.plugin.saveSettings();
					}));

			// Value setting (only show if operator isn't 'exists')
			if (filter.operator !== 'exists') {
				const valueSetting = new Setting(filterContainer)
					.setName('Value')
					.setDesc('The value to compare against');

				if (filter.type === 'boolean') {
					valueSetting.addDropdown(dropdown => dropdown
						.addOptions({
							'true': 'Yes',
							'false': 'No'
						})
						.setValue(filter.value)
						.onChange(async (value) => {
							filter.value = value;
							await this.plugin.saveSettings();
						}));
				} else {
					valueSetting.addText(text => {
						const placeholder = filter.type === 'number' ? 'Enter a number' :
							filter.type === 'array' ? 'Enter value to search for in list' :
							'Enter text value';
						
						text.setPlaceholder(placeholder)
							.setValue(filter.value)
							.onChange(async (value) => {
								filter.value = value;
								await this.plugin.saveSettings();
							});
						
						if (filter.type === 'number') {
							text.inputEl.type = 'number';
						}
					});
				}
			}

			// Remove button
			new Setting(filterContainer)
				.addButton(btn => btn
					.setButtonText('Remove Filter')
					.setClass('mod-warning')
					.onClick(async () => {
						this.plugin.settings.filters.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		});

		new Setting(containerEl)
			.setName('Add New Filter')
			.addButton(btn => btn
				.setButtonText('Add')
				.onClick(() => {
					this.plugin.settings.filters.push({
						key: '',
						value: '',
						operator: 'equals',
						type: 'string'
					});
					this.plugin.saveSettings();
					this.display();
				}));
	}
}

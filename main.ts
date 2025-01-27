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

		this.plugin.settings.filters.forEach((filter, index) => {
			const filterSetting = new Setting(containerEl)
				.setName(`Filter ${index + 1}`)
				.addText(text => text
					.setPlaceholder('Metadata key')
					.setValue(filter.key)
					.onChange(async (value) => {
						filter.key = value;
						await this.plugin.saveSettings();
					}))
				.addDropdown(dropdown => dropdown
					.addOptions({
						'equals': 'Equals',
						'contains': 'Contains',
						'exists': 'Exists',
						'includes': 'Includes (for arrays)',
						'greater': 'Greater than',
						'less': 'Less than'
					})
					.setValue(filter.operator)
					.onChange(async (value: any) => {
						filter.operator = value;
						await this.plugin.saveSettings();
					}))
				.addDropdown(dropdown => dropdown
					.addOptions({
						'string': 'Text',
						'number': 'Number',
						'array': 'Array',
						'boolean': 'Yes/No'
					})
					.setValue(filter.type || 'string')
					.onChange(async (value: any) => {
						filter.type = value;
						await this.plugin.saveSettings();
					}));

			if (filter.operator !== 'exists') {
				filterSetting.addText(text => text
					.setPlaceholder('Value')
					.setValue(filter.value)
					.onChange(async (value) => {
						filter.value = value;
						await this.plugin.saveSettings();
					}));
			}

			filterSetting.addButton(btn => btn
				.setButtonText('Remove')
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

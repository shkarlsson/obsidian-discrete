import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

interface MetadataFilterSettings {
	filters: MetadataFilter[];
}

interface MetadataFilter {
	key: string;
	value: string;
	operator: 'equals' | 'contains' | 'exists';
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
		const filter: MetadataFilter = {
			key: Object.keys(metadata)[0],
			value: metadata[Object.keys(metadata)[0]],
			operator: 'equals'
		};
		
		this.settings.filters.push(filter);
		await this.saveSettings();
		
		// Refresh file explorer
		this.app.workspace.trigger('file-explorer:refresh');
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
			new Setting(containerEl)
				.setName(`Filter ${index + 1}`)
				.setDesc(`${filter.key} ${filter.operator} ${filter.value}`)
				.addButton(btn => btn
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
						operator: 'equals'
					});
					this.plugin.saveSettings();
					this.display();
				}));
	}
}

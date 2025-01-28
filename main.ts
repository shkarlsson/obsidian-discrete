import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

interface MetadataFilterSettings {
	filters: MetadataFilter[];
	hideMatches: boolean;
	combineWithAnd: boolean;
}

interface MetadataFilter {
	key: string;
	value: string;
	operator: 'equals' | 'contains' | 'exists' | 'includes' | 'greater' | 'less';
	type: 'string' | 'number' | 'array' | 'boolean';
}

const DEFAULT_SETTINGS: MetadataFilterSettings = {
	filters: [],
	hideMatches: true,
	combineWithAnd: true
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
		if (value === undefined) {
			return false;
		}
		
		switch (filter.operator) {
			case 'exists':
				return true;
			case 'equals':
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

	async applyFiltersToExplorer() {
		const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		if (!fileExplorer) return;

		const files = this.app.vault.getMarkdownFiles();
		const visibleFiles = new Set<string>();

		for (const file of files) {
			const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!metadata) continue;

			let shouldBeVisible = false;
			
			if (this.settings.combineWithAnd) {
				// AND logic - must match all filters
				shouldBeVisible = this.settings.filters.every(filter => {
					return this.evaluateFilter(metadata, filter);
				});
			} else {
				// OR logic - must match any filter
				shouldBeVisible = this.settings.filters.some(filter => {
					return this.evaluateFilter(metadata, filter);
				});
			}

			// Invert visibility if hideMatches is true
			if (shouldBeVisible !== this.settings.hideMatches) {
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

		// Add filter behavior settings
		new Setting(containerEl)
			.setName('Hide Matching Files')
			.setDesc('When enabled, matching files will be hidden instead of shown')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideMatches)
				.onChange(async (value) => {
					this.plugin.settings.hideMatches = value;
					await this.plugin.saveSettings();
					// Remove existing filter styles
					const oldStyle = document.getElementById('metadata-filter-styles');
					if (oldStyle) oldStyle.remove();
					// Apply new filters
					await this.plugin.applyFiltersToExplorer();
					// Force refresh of file explorer
					this.app.workspace.trigger('file-explorer:refresh');
				}));

		new Setting(containerEl)
			.setName('Combine Filters with AND')
			.setDesc('When enabled, files must match ALL filters. When disabled, files must match ANY filter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.combineWithAnd)
				.onChange(async (value) => {
					this.plugin.settings.combineWithAnd = value;
					await this.plugin.saveSettings();
					this.plugin.applyFiltersToExplorer();
				}));

		containerEl.createEl('h3', {text: 'Filters'});

		// Create filters table
		const table = containerEl.createEl('table', { cls: 'filters-table' });
		
		// Add table header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		['Key', 'Operator', 'Type', 'Value', ''].forEach(text => {
			headerRow.createEl('th', { text });
		});

		// Add table body
		const tbody = table.createEl('tbody');
		
		this.plugin.settings.filters.forEach((filter, index) => {
			const row = tbody.createEl('tr');

			// Key cell
			const keyCell = row.createEl('td');
			const keyInput = keyCell.createEl('input', {
				type: 'text',
				placeholder: 'Enter key (e.g., tags, status)',
				value: filter.key
			});
			keyInput.addEventListener('change', async () => {
				filter.key = keyInput.value;
				await this.plugin.saveSettings();
			});

			// Operator cell
			const operatorCell = row.createEl('td', { cls: 'operator-cell' });
			const operators = [
				{ value: 'equals', label: '=' },
				{ value: 'contains', label: '∈' },
				{ value: 'exists', label: '∃' },
				{ value: 'includes', label: '⊂' },
				{ value: 'greater', label: '>' },
				{ value: 'less', label: '<' }
			];
			operators.forEach(op => {
				const btn = operatorCell.createEl('button', {
					text: op.label,
					cls: `operator-button ${filter.operator === op.value ? 'is-active' : ''}`
				});
				btn.addEventListener('click', async () => {
					operatorCell.findAll('.operator-button').forEach(b => 
						b.removeClass('is-active'));
					btn.addClass('is-active');
					filter.operator = op.value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

			// Type cell
			const typeCell = row.createEl('td');
			const typeSelect = typeCell.createEl('select');
			const types = {
				'string': 'Text',
				'number': 'Number',
				'array': 'List/Array',
				'boolean': 'Yes/No'
			};
			Object.entries(types).forEach(([value, label]) => {
				const option = typeSelect.createEl('option', {
					value: value,
					text: label
				});
				if (value === filter.type) {
					option.selected = true;
				}
			});
			typeSelect.addEventListener('change', async () => {
				filter.type = typeSelect.value as any;
				await this.plugin.saveSettings();
				this.display();
			});

			// Value cell
			const valueCell = row.createEl('td');
			if (filter.operator !== 'exists') {
				if (filter.type === 'boolean') {
					const select = valueCell.createEl('select');
					['true', 'false'].forEach(value => {
						const option = select.createEl('option', {
							value: value,
							text: value === 'true' ? 'Yes' : 'No'
						});
						if (value === filter.value) {
							option.selected = true;
						}
					});
					select.addEventListener('change', async () => {
						filter.value = select.value;
						await this.plugin.saveSettings();
					});
				} else {
					const input = valueCell.createEl('input', {
						type: filter.type === 'number' ? 'number' : 'text',
						placeholder: filter.type === 'number' ? 'Enter a number' :
							filter.type === 'array' ? 'Enter value to search for in list' :
							'Enter text value',
						value: filter.value
					});
					input.addEventListener('change', async () => {
						filter.value = input.value;
						await this.plugin.saveSettings();
					});
				}
			}

			// Remove button cell
			const removeCell = row.createEl('td');
			const removeButton = removeCell.createEl('button', {
				text: '×',
				cls: 'discrete-remove-filter'
			});
			removeButton.addEventListener('click', async () => {
				this.plugin.settings.filters.splice(index, 1);
				await this.plugin.saveSettings();
				await this.plugin.applyFiltersToExplorer();
				this.display();
			});
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
					this.plugin.saveSettings().then(() => {
						// Only refresh display after settings are saved
						this.display();
					});
				}));

		// Add version number at bottom right
		const versionEl = containerEl.createDiv('metadata-filter-version');
		versionEl.setText(`v${this.plugin.manifest.version}`);
	}
}

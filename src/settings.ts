import { App, PluginSettingTab, Setting } from 'obsidian';
import DiscretePlugin from './main';

export class DiscreteSettingTab extends PluginSettingTab {
	plugin: DiscretePlugin;

	constructor(app: App, plugin: DiscretePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Add filter behavior settings
		new Setting(containerEl)
			.setName('Enable file explorer filtering')
			.setDesc('Apply the metadata filters to the file explorer to hide or show files based on their frontmatter.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableExplorerFilter)
				.onChange(async (value) => {
					this.plugin.settings.enableExplorerFilter = value;
					await this.plugin.saveSettings();

					if (!value) {
						// Remove any existing filter styles when disabling
						const style = document.getElementById('metadata-filter-styles');
						if (style) style.remove();
					} else {
						// Only apply filters if enabling
						await this.plugin.applyFiltersToExplorer();
					}
					// Force refresh of file explorer
					this.app.workspace.trigger('file-explorer:refresh');
				}));

		new Setting(containerEl).setName('Filter behavior').setHeading();

		new Setting(containerEl)
			.setName('Hide matching files')
			.setDesc('When enabled, matching files will be hidden instead of shown')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideMatches)
				.onChange(async (value) => {
					this.plugin.settings.hideMatches = value;
					await this.plugin.saveSettings();
					if (this.plugin.settings.enableExplorerFilter) {
						// Remove existing filter styles
						const oldStyle = document.getElementById('metadata-filter-styles');
						if (oldStyle) oldStyle.remove();
						// Apply new filters
						await this.plugin.applyFiltersToExplorer();
					}
					// Force refresh of file explorer
					this.app.workspace.trigger('file-explorer:refresh');
				}));

		new Setting(containerEl)
			.setName('Combine filters with AND')
			.setDesc('When enabled, files must match ALL filters. When disabled, files must match ANY filter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.combineWithAnd)
				.onChange(async (value) => {
					this.plugin.settings.combineWithAnd = value;
					await this.plugin.saveSettings();
					if (this.plugin.settings.enableExplorerFilter) {
						await this.plugin.applyFiltersToExplorer();
					}
					// Force refresh of file explorer
					this.app.workspace.trigger('file-explorer:refresh');
				}));

		new Setting(containerEl).setName('Rules').setHeading();

		// Create filters table
		const table = containerEl.createEl('table', { cls: 'filters-table' });

		// Add table header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		const headers = [
			{ title: 'Key', desc: 'Frontmatter field to filter on' },
			{ title: 'Operator', desc: 'How to compare values' },
			{ title: 'Type', desc: 'Type of value to match' },
			{ title: 'Value', desc: 'Value to compare against' },
			{ title: '', desc: '' }
		];
		headers.forEach(header => {
			const th = headerRow.createEl('th');
			th.createEl('div', { text: header.title });
			if (header.desc) {
				th.createEl('div', {
					text: header.desc,
					cls: 'header-description'
				});
			}
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
				if (this.plugin.settings.enableExplorerFilter) {
					await this.plugin.applyFiltersToExplorer();
				}
			});

			// Operator cell
			const operatorCell = row.createEl('td', { cls: 'operator-cell' });
			const operators = [
				{ value: 'equals', label: '=', tooltip: 'Equals exactly' },
				{ value: 'contains', label: '∈', tooltip: 'Contains (text only)' },
				{ value: 'exists', label: '∃', tooltip: 'Field exists' },
				{ value: 'includes', label: '⊂', tooltip: 'List includes value' },
				{ value: 'greater', label: '>', tooltip: 'Greater than' },
				{ value: 'less', label: '<', tooltip: 'Less than' }
			];
			operators.forEach(op => {
				const btn = operatorCell.createEl('button', {
					text: op.label,
					cls: `operator-button ${filter.operator === op.value ? 'is-active' : ''}`,
					attr: { title: op.tooltip }
				});
				btn.addEventListener('click', async () => {
					operatorCell.findAll('.operator-button').forEach(b =>
						b.removeClass('is-active'));
					btn.addClass('is-active');
					filter.operator = op.value as 'equals' | 'contains' | 'exists' | 'includes' | 'greater' | 'less';
					await this.plugin.saveSettings();
					if (this.plugin.settings.enableExplorerFilter) {
						await this.plugin.applyFiltersToExplorer();
					}
					this.display();
				});
			});

			// Type cell
			const typeCell = row.createEl('td');
			if (!['exists', 'greater', 'less', 'contains'].includes(filter.operator)) {
				const typeSelect = typeCell.createEl('select');
				const types = {
					'string': 'Text',
					'number': 'Number',
					'array': 'List/array',
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
					if (this.plugin.settings.enableExplorerFilter) {
						await this.plugin.applyFiltersToExplorer();
					}
					this.display();
				});
			} else {
				if (['greater', 'less'].includes(filter.operator)) {
					filter.type = 'number';
				} else if (filter.operator === 'contains') {
					filter.type = 'string';
				}
				typeCell.addClass('discrete-empty-cell');
			}

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
						if (this.plugin.settings.enableExplorerFilter) {
							await this.plugin.applyFiltersToExplorer();
						}
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
						if (this.plugin.settings.enableExplorerFilter) {
							await this.plugin.applyFiltersToExplorer();
						}
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

		// Add empty row with plus button
		const emptyRow = tbody.createEl('tr');
		// Add empty cells for alignment
		emptyRow.createEl('td');
		emptyRow.createEl('td');
		emptyRow.createEl('td');
		emptyRow.createEl('td');
		const addCell = emptyRow.createEl('td');
		const addButton = addCell.createEl('button', {
			text: '+',
			cls: 'discrete-remove-filter'
		});
		addButton.addEventListener('click', async () => {
			this.plugin.settings.filters.push({
				key: '',
				value: '',
				operator: 'equals',
				type: 'string'
			});
			await this.plugin.saveSettings();
			if (this.plugin.settings.enableExplorerFilter) {
				await this.plugin.applyFiltersToExplorer();
			}
			this.display();
		});

		// Add version number at bottom right
		const versionEl = containerEl.createDiv('metadata-filter-version');
		versionEl.setText(`v${this.plugin.manifest.version}`);
	}
}

export interface MetadataFilterSettings {
	filters: MetadataFilter[];
	hideMatches: boolean;
	combineWithAnd: boolean;
	enableExplorerFilter: boolean;
	enableSearchFilter: boolean;
	enableOmnisearchFilter: boolean;
}

export interface MetadataFilter {
	key: string;
	value: string;
	operator: 'equals' | 'contains' | 'exists' | 'includes' | 'greater' | 'less';
	type: 'string' | 'number' | 'array' | 'boolean';
}

export const DEFAULT_SETTINGS: MetadataFilterSettings = {
	filters: [],
	hideMatches: true,
	combineWithAnd: true,
	enableExplorerFilter: true,
	enableSearchFilter: true,
	enableOmnisearchFilter: true
}

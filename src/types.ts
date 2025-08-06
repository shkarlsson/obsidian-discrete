export interface DiscreteSettings {
	filters: DiscreteFilter[];
	hideMatches: boolean;
	combineWithAnd: boolean;
	enableExplorerFilter: boolean;
}

export interface DiscreteFilter {
	key: string;
	value: string;
	operator: 'equals' | 'contains' | 'exists' | 'includes' | 'greater' | 'less';
	type: 'string' | 'number' | 'array' | 'boolean';
}

export const DEFAULT_SETTINGS: DiscreteSettings = {
	filters: [],
	hideMatches: true,
	combineWithAnd: false,
	enableExplorerFilter: true
}

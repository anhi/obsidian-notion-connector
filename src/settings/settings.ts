export type { NotionConnectorSettings }
export { DEFAULT_SETTINGS }

interface NotionConnectorSettings {
	apiToken: string;
}

const DEFAULT_SETTINGS: NotionConnectorSettings = {
	apiToken: ''
}

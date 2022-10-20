import { addIcon, normalizePath, Plugin, TFile } from 'obsidian';

import { DEFAULT_SETTINGS, NotionConnectorSettings } from "./settings/settings"
import { NotionConnectorSettingTab } from "./settings/notionConnectorSettingsTab"
import { FrontMatterHandler } from './frontMatterHandler';

import NotionConnector from './notionConnector';
import DownloadFromNotionModal from './downloadFromNotionModal';

export default class NotionConnectorPlugin extends Plugin {
	settings: NotionConnectorSettings
	logoPath: string

	notionConnector: NotionConnector


	async addFrontMatter(file: TFile, key: string, value: string) {
		const frontMatterHandler = new FrontMatterHandler(this.app.vault, this.app.metadataCache, file)

		frontMatterHandler.set(key, value)

		await frontMatterHandler.apply()
	}

	async onload() {
		await this.loadSettings();

		this.notionConnector = new NotionConnector(this.settings.apiToken, this.app)

		this.logoPath = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/images`)

		await this.app.vault.adapter.read(`${this.logoPath}/Notion-logo.svg`)
			.then((logo) => addIcon('notion', logo))

		// Add icon to the side bar
		this.addRibbonIcon('notion', 'Notion Plugin', (evt: MouseEvent) => {
			new DownloadFromNotionModal(this.app, 
				(notionID, fileName) => this.notionConnector.downloadFromNotion(notionID, fileName)).open();
		});

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'download-from-notion',
			name: 'Download page or db from Notion',
			callback: () => {
				new DownloadFromNotionModal(this.app, 
					(notionID, fileName) => this.notionConnector.downloadFromNotion(notionID, fileName)).open();
			}
		});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sync-current-file-with-notion',
			name: 'Update current file from Notion (replaces current content)',
			callback: () => {
				this.notionConnector.syncCurrentPageWithNotion();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NotionConnectorSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
import { addIcon, App, Editor, MarkdownView, Modal, normalizePath, Plugin, TFile } from 'obsidian';

import { DEFAULT_SETTINGS, NotionConnectorSettings } from "./settings/settings"
import { NotionConnectorSettingTab } from "./settings/notionConnectorSettingsTab"
import { fetchUsingObsidianRequest } from './helpers';
import { FrontMatterHandler } from './frontMatterHandler';

import { Client, isFullDatabase, isFullPage } from '@notionhq/client';
import { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints';

export default class NotionConnectorPlugin extends Plugin {
	settings: NotionConnectorSettings;
	notion: Client;
	logoPath: string


	async addFrontMatter(file: TFile, key: string, value: string) {
		const frontMatterHandler = new FrontMatterHandler(this.app.vault, this.app.metadataCache, file)

		frontMatterHandler.set(key, value)

		await frontMatterHandler.apply()
	}
	
	notionDatabaseToMarkdown(notionDb: DatabaseObjectResponse) {
		const title = notionDb.title[0].plain_text

		let result = "---\ndatabase-plugin: basic\n---\n\n"

		result += `#${notionDb.title[0].plain_text}`

		result += "%%%% dbfolder:yaml\n"
		result += `name: ${title}\n`
		result += "description:\n" // todo: parse description from notion item
		result += "columns:\n"

		
		// iterate over the columns
		let position = 0
		for (const [columnName, columnProperties] of Object.entries(notionDb.properties)) {
			result += `  ${columnName}:\n`
			result += `    key: ${columnName}\n`
			result += `    input: text\n` // todo: switch based on type
			result += `    accessorKey: \\"${columnProperties.id}\\"\n` // todo: is this correct?
			result += `    label: ${columnName}\n`
			result += `    position: ${position++}\n`
			result += `    skipPersist: false\n`
			result += `    isHidden: false\n`
			result += `    sortIndex: -1\n`
			result += `    config:\n`
			result += `      enable_media_view: true\n`
			result += `      media_width: 80\n`
			result += `      media_height: 100\n`
			result += `      isInline: false\n`			
		}
		result += `%%%%\n`

		// get the entries for this database
		return result
	}

	async notionDatabaseToTasks(notionDb: DatabaseObjectResponse) {
		let result = `#${notionDb.title[0].plain_text}`

		const dbPages = await this.notion.databases.query({
			database_id: notionDb.id
		})

		for (const dbPage of dbPages.results) {
			if (!isFullPage(dbPage)) {
				continue
			}

			console.log(dbPage)
		}

		// get the entries for this database
		return result
	}

	async syncCurrentPageWithNotion() {
		const file = this.app.workspace.getActiveFile()

		if (!file) {
			return;
		}

		const frontMatterHandler = new FrontMatterHandler(this.app.vault, this.app.metadataCache, file)

		const notionId = frontMatterHandler.get("notion-id")
		let notionType = frontMatterHandler.get("notion-type", undefined)

		// retrieve page or db with the given id
		let notionItem = undefined;
		
		if (!notionType || notionType == "page") {
			notionItem = await this.notion.pages.retrieve({page_id: notionId})
				.then(response => {
					return response
				})
				.catch(reason => {
					return undefined;
				})
		}

		if (!notionItem && notionType != "page") {
			notionItem = notionItem 
				?? await this.notion.databases.retrieve({database_id: notionId})
					.then(response => {
						if (isFullDatabase(response)) {
							console.warn(this.notionDatabaseToMarkdown(response))
						}
						return response
					})
					.catch(reason => {
						return null
					})
		}

		if (!notionItem) {
			console.warn("Could not sync with notion!")
			return
		}

		const notionLastUpdate = 'last_edited_time' in notionItem 
			? window.moment(notionItem['last_edited_time'], 'YYYY-MM-DDTHH:mm:ss:SSS[Z]')
			: undefined

		const syncTime = window.moment()

		console.log((notionLastUpdate && notionLastUpdate < syncTime) ? "in sync" : "update needed")

		notionType = notionItem["object"]
		frontMatterHandler.set("notion-type", notionType)
		frontMatterHandler.set("notion-last-sync-time", syncTime.format('YYYY-MM-DDTHH:mm:ss:SSS[Z]'))

		frontMatterHandler.apply()
	
		console.log(notionItem)
	}
	

	async onload() {
		await this.loadSettings();

		this.logoPath = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/images`)

		await this.app.vault.adapter.read(`${this.logoPath}/Notion-logo.svg`)
			.then((logo) => addIcon('notion', logo))

		// Test notion integration
		const ribbonIconEl = this.addRibbonIcon('notion', 'Notion Plugin', (evt: MouseEvent) => {
			this.syncCurrentPageWithNotion();
		});

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sync-current-file-with-notion',
			name: 'Sync current file with notion',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.syncCurrentPageWithNotion();

				console.log(editor.getSelection());
				//editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NotionConnectorSettingTab(this.app, this));

		// Initializing the Notion client
		this.notion = new Client({
			auth: this.settings.apiToken,
			fetch: fetchUsingObsidianRequest,
		})
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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

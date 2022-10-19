import { addIcon, App, Editor, MarkdownView, Modal, normalizePath, Plugin, TFile } from 'obsidian';

import { DEFAULT_SETTINGS, NotionConnectorSettings } from "./settings/settings"
import { NotionConnectorSettingTab } from "./settings/notionConnectorSettingsTab"
import { fetchUsingObsidianRequest } from './helpers';
import { FrontMatterHandler } from './frontMatterHandler';

import { Client, isFullDatabase, isFullPage, isFullUser } from '@notionhq/client';
import { DatabaseObjectResponse, PageObjectResponse, SelectPropertyResponse } from '@notionhq/client/build/src/api-endpoints';
import { NotionToMarkdown } from 'notion-to-md';

export default class NotionConnectorPlugin extends Plugin {
	settings: NotionConnectorSettings;
	notion: Client;
	n2m: NotionToMarkdown;
	logoPath: string


	async addFrontMatter(file: TFile, key: string, value: string) {
		const frontMatterHandler = new FrontMatterHandler(this.app.vault, this.app.metadataCache, file)

		frontMatterHandler.set(key, value)

		await frontMatterHandler.apply()
	}

	async pageToMarkdown(page: PageObjectResponse) {
		const md = await this.n2m.pageToMarkdown(page.id)
			.then(mdblocks => {
				this.n2m.toMarkdownString(mdblocks)
			})
		
		return md
	}

	formatOptions(options: SelectPropertyResponse[]) {
		return ("    " + options.map(o => `- { label: "${o.name}", backgroundColor: "${o.color}" }`).join("\n    "))
	}
	
	
	notionDatabaseToMarkdown(notionDb: DatabaseObjectResponse, file: TFile, frontMatterHandler: FrontMatterHandler) {
		const title = notionDb.title[0].plain_text

		frontMatterHandler.set("database-plugin", "basic")

		let result = `# ${notionDb.title[0].plain_text}\n\n`

		result += "%% dbfolder:yaml\n"
		result += `name: ${title}\n`
		result += "description:\n" // todo: parse description from notion item
		result += "columns:\n"
		
		// iterate over the columns
		let position = 0
		for (const [columnName, columnProperties] of Object.entries(notionDb.properties)) {
			result += `  ${columnName}:\n`
			result += `    key: ${columnName.replace(/ /g, "-")}\n`
			
			if (columnProperties.type == "select") {
				result += `    input: select\n` // todo: switch based on type
				result += `    options:\n` + this.formatOptions(columnProperties.select.options) + "\n"
			} else if (columnProperties.type == "multi_select") {
				result += `    input: tags\n` // todo: switch based on type
				result += `    options:\n` + this.formatOptions(columnProperties.multi_select.options) + "\n"
			} else {
				result += `    input: text\n`
			}

			result += `    accessorKey: ${Buffer.from(columnProperties.id).toString('base64')}\n` // todo: is this correct?
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

		result += `filters:\n`
		result += `  enabled: false\n`
		result += `  conditions:\n`
		result += `config:\n`
		result += `  remove_field_when_delete_column: false\n`
		result += `  cell_size: normal\n`
		result += `  sticky_first_column: false\n`
		result += `  group_folder_column: \n`
		result += `  remove_empty_folders: false\n`
		result += `  automatically_group_files: false\n`
		result += `  hoist_files_with_empty_attributes: true\n`
		result += `  show_metadata_created: true\n`
		result += `  show_metadata_modified: true\n`
		result += `  show_metadata_tasks: true\n`
		result += `  show_metadata_inlinks: true\n`
		result += `  show_metadata_outlinks: true\n`
		result += `  source_data: query\n`
		result += `  source_form_result: FROM "${file.parent.path ? file.parent.path.replace(/^\//, "")  : ""}${file.basename}-entries"\n`
		result += `  source_destination_path: "${file.parent.path ? file.parent.path.replace(/^\//, "")  : ""}${file.basename}-entries"\n`
		result += `  frontmatter_quote_wrap: false\n`
		result += `  row_templates_folder: /\n`
		result += `  current_row_template: \n`
		result += `  pagination_size: 10\n`
		result += `  enable_js_formulas: true\n`
		result += `  formula_folder_path: /\n`
		result += `  inline_default: false\n`
		result += `  inline_new_position: top\n`
		result += `  date_format: yyyy-MM-dd\n`
		result += `  datetime_format: yyyy-MM-dd HH:mm:ss\n`

		result += `%%\n`

		// get the entries for this database
		return result
	}

	async syncDatabaseEntries(notionDb: DatabaseObjectResponse, file: TFile) {
		const itemDir = file.parent.path + `/${file.basename}-entries`
		
		await this.app.vault.adapter.exists(itemDir)
			.then(result => {
					if (!result) {
						return this.app.vault.createFolder(itemDir)
					}
				}
			)

		const dbPages = await this.notion.databases.query({
			database_id: notionDb.id
		})

		for (const dbPage of dbPages.results) {
			if (!isFullPage(dbPage)) {
				continue
			}

			let content = `---\n`
			content += `notion-item: ${dbPage.id}\n`
			content += `notion-sync-time: ${window.moment().format('YYYY-MM-DDTHH:mm:ss:SSS[Z]')}\n`

			Object.entries(dbPage.properties).forEach(
				([key, value]) => {
					content += key.replace(/ /g, "-") + ": "

					switch (value.type) {
						case "people":
							content += "\n  " + value.people.map(x => isFullUser(x) ? `- [[${x.name}]]` : "").join("\n  ") // todo: store id somewhere?
							break
						case "checkbox":
							content += value.checkbox
							break
						case "created_time":
							content += value.created_time
							break
						case "date":
							content += value.date?.start ? value.date?.start : ""
							content += (value.date?.start && value.date?.end) ? " -- " : ""
							content += value.date?.end ? value.date?.end : ""
							content += value.date?.time_zone ? " " + value.date?.time_zone : ""
							break
						case "title":
							content += value.title.map(t => this.n2m.annotatePlainText(t.plain_text, t.annotations)).join(" ")
							break
					}

					content += "\n"
				}
			);

			content += `---\n`

			content += await this.pageToMarkdown(dbPage)

			const itemFileName = `${itemDir}/${dbPage.id}.md`
			const fileExists = await this.app.vault.adapter.exists(itemFileName)

			if (!fileExists) {
				await this.app.vault.create(itemFileName, content)
			} else {
				await this.app.vault.adapter.write(itemFileName, content)
			}

			console.log(dbPage)
		}
	}

	async syncCurrentPageWithNotion(editor: Editor) {
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
							console.log(response)
							editor.replaceSelection(this.notionDatabaseToMarkdown(response, file, frontMatterHandler))
						}
						return response
					})
					.catch(reason => {
						return null
					})

			if (notionItem && isFullDatabase(notionItem)) {
				await this.syncDatabaseEntries(notionItem, file)
			}
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
			this.app.commands.executeCommandById('obsidian-notion-connector:sync-current-file-with-notion');
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
				this.syncCurrentPageWithNotion(editor);
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

		// set up notion to markdown converter
		this.n2m = new NotionToMarkdown({ 
			notionClient: this.notion 
		});
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

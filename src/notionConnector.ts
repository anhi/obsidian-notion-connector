import { Client, isFullDatabase, isFullPage, isFullUser } from "@notionhq/client";
import { DatabaseObjectResponse, PageObjectResponse, SelectPropertyResponse } from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import { App, Editor, Modal, TAbstractFile, TFile } from "obsidian";
import { FrontMatterHandler } from "./frontMatterHandler";
import { fetchUsingObsidianRequest } from "./helpers";
import MsgModal from "./msgModal";

export default class NotionConnector {
    notion: Client
	n2m:    NotionToMarkdown
    app:    App

    constructor(apiToken: string, app: App) {
        this.app = app

        // Initializing the Notion client
		this.notion = new Client({
			auth: apiToken,
			fetch: fetchUsingObsidianRequest,
		})

		// set up notion to markdown converter
		this.n2m = new NotionToMarkdown({ 
			notionClient: this.notion 
		});
    }

    isTFile(file: TFile | TAbstractFile): file is TFile {
        return (file as TFile).stat !== undefined;
    }

    private async createOrOverwrite(fileName: string, content: string) {
        const fileExists = await this.app.vault.adapter.exists(fileName);

        if (!fileExists) {
            await this.app.vault.create(fileName, content);
        } else {
            await this.app.vault.adapter.write(fileName, content);
        }
    }

	formatOptions(options: SelectPropertyResponse[]) {
		return ("    " 
            + options.map(o => `- { label: "${o.name}", backgroundColor: "${o.color}" }`)
                     .join("\n    "))
	}

    async pageToMarkdown(page: PageObjectResponse) {
		const md = await this.n2m.pageToMarkdown(page.id)
			.then(mdblocks => {
				return this.n2m.toMarkdownString(mdblocks)
			})
		
		return md
	}

	notionDatabaseToMarkdown(notionDb: DatabaseObjectResponse, file: TFile) {
		const title = notionDb.title[0].plain_text


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
			content += `notion-id: ${dbPage.id}\n`
			content += `notion-sync-time: ${window.moment().format('YYYY-MM-DDTHH:mm:ss:SSS[Z]')}\n`

			let title = ""
			let dueDate = ""
			let date = ""

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
							date = value.date?.start ? value.date?.start : ""
							date += (value.date?.start && value.date?.end) ? " -- " : ""
							date += value.date?.end ? value.date?.end : ""
							date += value.date?.time_zone ? " " + value.date?.time_zone : ""

							content += date

							if (key == "Due Date") {
								dueDate = date
							}
							break
						case "title":
							title = value.title.map(t => this.n2m.annotatePlainText(t.plain_text, t.annotations)).join(" ")
							content += title
							break
					}

					content += "\n"
				}
			);

			content += `---\n`

			content += await this.pageToMarkdown(dbPage)

			if ("Complete" in dbPage.properties && "checkbox" in dbPage.properties.Complete) {
				content += `\n - [${dbPage.properties.Complete.checkbox ? "x" : " "}]`
				content += ` ${title} `

				if ("Priority" in dbPage.properties && "select" in dbPage.properties.Priority) {
					content += dbPage.properties.Priority.select?.name + " "
				}
				if (dueDate) {
					content += '📅 ' + dueDate 
				}
				content += "\n"
			}

			const itemFileName = `${itemDir}/${dbPage.id}.md`
			await this.createOrOverwrite(itemFileName, content);

			//console.log(dbPage)
		}
	}

    async downloadFromNotionToFile(notionId: string, file: TFile, notionType?: string) {

        const msgModal = new MsgModal(this.app, "Starting notion download... this can take a while...")
        msgModal.open()

		// retrieve page or db with the given id
		let notionItem = undefined;
		
        let content = ""

		if (!notionType || notionType == "page") {
			notionItem = await this.notion.pages.retrieve({page_id: notionId})
				.catch(reason => {
					return undefined;
				})

			if (notionItem && isFullPage(notionItem)) {
				content = await this.pageToMarkdown(notionItem)
            }
		}

		if (!notionItem && notionType != "page") {
			notionItem = notionItem 
				?? await this.notion.databases.retrieve({database_id: notionId})
                    .catch(reason => {
                        console.log(reason)
                        return null
                    })

            
            if (notionItem && isFullDatabase(notionItem)) {
                content = await this.notionDatabaseToMarkdown(notionItem, file)

                await this.syncDatabaseEntries(notionItem, file)
			}
		}

		if (!notionItem) {
			console.warn("Could not sync with notion!")
			return
		}

        // first, replace the content of the file
        await this.app.vault.modify(file, content)
            .then(() => {
                if (!notionItem)
                    return

                const frontMatterHandler = new FrontMatterHandler(this.app.vault, this.app.metadataCache, file)

                const notionLastUpdate = 'last_edited_time' in notionItem 
                    ? window.moment(notionItem['last_edited_time'], 'YYYY-MM-DDTHH:mm:ss:SSS[Z]')
                    : undefined
        
                const syncTime = window.moment()
        
                //console.log((notionLastUpdate && notionLastUpdate < syncTime) ? "in sync" : "update needed")
        
                notionType = notionItem["object"]
                frontMatterHandler.set("notion-id", notionId)
                frontMatterHandler.set("notion-type", notionType ?? "")
                frontMatterHandler.set("notion-last-sync-time", syncTime.format('YYYY-MM-DDTHH:mm:ss:SSS[Z]'))
        
                if (notionType == "database") {
                    frontMatterHandler.set("database-plugin", "basic")
                }

                // add banner, if appropriate
                if ("cover" in notionItem) {
                    frontMatterHandler.set("banner", `"${notionItem.cover?.external?.url}"`)
                }

                frontMatterHandler.apply()
            })
            .then(() => {
                msgModal.close()
                new MsgModal(this.app, "Notion Download finished!").open()
            })
    }
   
	async syncCurrentPageWithNotion() {
		const file = this.app.workspace.getActiveFile()

		if (!file) {
            console.error("No file active")
			return;
		}
        
        const frontMatterHandler = new FrontMatterHandler(this.app.vault, this.app.metadataCache, file)

		const notionId = frontMatterHandler.get("notion-id", "")

        if (!notionId) {
            return;
        }

		const notionType = frontMatterHandler.get("notion-type", undefined) // this can be used to avoid unnecessary api calls

        this.downloadFromNotionToFile(notionId, file, notionType)
    }

    async downloadFromNotion(notionId: string, fileName: string): Promise<void> {
        let file = this.app.vault.getAbstractFileByPath(fileName)

        if (!file) {
            file = await this.app.vault.create(fileName, "")
        }

        if (!this.isTFile(file)) {
            console.error("Can't handle TAbstractFiles yet!")
            return
        }
        
        this.downloadFromNotionToFile(notionId, file)
	}
}

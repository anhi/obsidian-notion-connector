import { App, Modal, Setting } from "obsidian";

export default class DownloadFromNotionModal extends Modal {
    fileName: string;
    notionID: string;

    onSubmit: (notionID: string, fileName: string) => void;

    constructor(app: App, onSubmit: (notionID: string, fileName: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }
  
    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Download from Notion" });

        new Setting(contentEl)
            .setName("Notion ID")
            .addText((text) =>
                text.onChange((value) => {
                    this.notionID = value
                }));

        new Setting(contentEl)
            .setName("File Name (will be created or overwritten)")
            .addText((text) =>
                text.setPlaceholder("Example: folder/notion_db")
                    .onChange((value) => {
                        this.fileName = value
                    }));

        new Setting(contentEl)
        .addButton((btn) =>
            btn
            .setButtonText("Submit")
            .setCta()
            .onClick(() => {
                this.close();
                this.onSubmit(this.notionID, this.fileName + ".md");
            }));
    }
  
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
import { App, Modal } from "obsidian";

export default class MsgModal extends Modal {
    msg: string

    constructor(app: App, msg: string) {
        super(app);
        this.msg = msg;
    }
  
    onOpen() {
        const { contentEl } = this;
        contentEl.setText(this.msg)
    }
  
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
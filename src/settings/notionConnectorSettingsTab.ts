import { App, PluginSettingTab, Setting } from "obsidian";
import NotionConnectorPlugin from "src/main";

export { NotionConnectorSettingTab }

class NotionConnectorSettingTab extends PluginSettingTab {
	plugin: NotionConnectorPlugin;

	constructor(app: App, plugin: NotionConnectorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for Notion connector.'});

		new Setting(containerEl)
			.setName('Notion API token')
			.setDesc('Secret API token to access Notion api')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.apiToken)
				.onChange(async (value) => {
					this.plugin.settings.apiToken = value;
					await this.plugin.saveSettings();
				}));
	}
}

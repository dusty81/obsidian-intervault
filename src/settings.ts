import { App, PluginSettingTab, Setting } from "obsidian";
import type InterVaultPlugin from "./main";

export class InterVaultSettingTab extends PluginSettingTab {
  plugin: InterVaultPlugin;

  constructor(app: App, plugin: InterVaultPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "InterVault Settings" });

    new Setting(containerEl)
      .setName("Default transfer mode")
      .setDesc("Default selection when the transfer dialog opens")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("copy", "Copy")
          .addOption("move", "Move")
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultMode = value as "copy" | "move";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Add transfer metadata")
      .setDesc("Add moved-from and moved-date to frontmatter of transferred notes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.addFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.addFrontmatter = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

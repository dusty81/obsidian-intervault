import { Plugin, Notice } from "obsidian";
import { InterVaultSettings, DEFAULT_SETTINGS } from "./types";

export default class InterVaultPlugin extends Plugin {
  settings: InterVaultSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "transfer-current-note",
      name: "Transfer current note to another vault",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          if (!checking) {
            new Notice("InterVault: Transfer flow not yet implemented");
          }
          return true;
        }
        return false;
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

import { App, Modal, Setting, TFile } from "obsidian";
import { TransferMode } from "../types";
import { ResolvedResources } from "../resource-resolver";

export interface TransferOptions {
  mode: TransferMode;
  includeLinkedNotes: TFile[];
}

export class TransferOptionsModal extends Modal {
  private resolved: ResolvedResources;
  private defaultMode: TransferMode;
  private onConfirm: (options: TransferOptions) => void;
  private selectedMode: TransferMode;
  private linkedNoteToggles: Map<string, boolean>;

  constructor(
    app: App,
    resolved: ResolvedResources,
    defaultMode: TransferMode,
    onConfirm: (options: TransferOptions) => void,
  ) {
    super(app);
    this.resolved = resolved;
    this.defaultMode = defaultMode;
    this.onConfirm = onConfirm;
    this.selectedMode = defaultMode;
    this.linkedNoteToggles = new Map();
    for (const note of resolved.linkedNotes) {
      this.linkedNoteToggles.set(note.path, false);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("intervault-options-modal");

    contentEl.createEl("h2", { text: "Transfer Options" });

    // Summary
    const summaryEl = contentEl.createDiv("intervault-summary");
    summaryEl.createEl("p", {
      text: `${this.resolved.primaryFiles.length} file(s) selected`,
    });
    if (this.resolved.resources.length > 0) {
      summaryEl.createEl("p", {
        text: `${this.resolved.resources.length} attachment(s) will be included`,
      });
    }

    // Mode selection
    new Setting(contentEl)
      .setName("Transfer mode")
      .setDesc("Copy keeps the original, Move deletes it after transfer")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("copy", "Copy")
          .addOption("move", "Move")
          .setValue(this.selectedMode)
          .onChange((value) => {
            this.selectedMode = value as TransferMode;
          }),
      );

    // Linked notes
    if (this.resolved.linkedNotes.length > 0) {
      contentEl.createEl("h3", { text: "Linked Notes" });
      contentEl.createEl("p", {
        text: "These notes are linked from your selection. Toggle to include them:",
        cls: "setting-item-description",
      });

      for (const note of this.resolved.linkedNotes) {
        new Setting(contentEl).setName(note.basename).addToggle((toggle) =>
          toggle.setValue(false).onChange((value) => {
            this.linkedNoteToggles.set(note.path, value);
          }),
        );
      }
    }

    // Confirm / Cancel
    const buttonRow = contentEl.createDiv("intervault-buttons");
    new Setting(buttonRow)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Transfer")
          .setCta()
          .onClick(() => {
            const includeLinkedNotes = this.resolved.linkedNotes.filter(
              (n) => this.linkedNoteToggles.get(n.path) === true,
            );
            this.onConfirm({
              mode: this.selectedMode,
              includeLinkedNotes,
            });
            this.close();
          }),
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

import { App, FuzzySuggestModal } from "obsidian";

export class FolderSelectModal extends FuzzySuggestModal<string> {
  private folders: string[];
  private onSelect: (folder: string) => void;

  constructor(app: App, folders: string[], onSelect: (folder: string) => void) {
    super(app);
    this.folders = folders;
    this.onSelect = onSelect;
    this.setPlaceholder("Select destination folder (/ = vault root)...");
  }

  getItems(): string[] {
    return this.folders;
  }

  getItemText(folder: string): string {
    return folder === "/" ? "/ (vault root)" : folder;
  }

  onChooseItem(folder: string): void {
    this.onSelect(folder);
  }
}

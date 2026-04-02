import { App, FuzzySuggestModal } from "obsidian";

export class FolderSelectModal extends FuzzySuggestModal<string> {
  private folders: string[];
  private onSelect: (folder: string) => void;
  private defaultFolder: string;

  constructor(app: App, folders: string[], defaultFolder: string, onSelect: (folder: string) => void) {
    super(app);
    this.folders = folders;
    this.defaultFolder = defaultFolder;
    this.onSelect = onSelect;
    this.setPlaceholder("Select destination folder (/ = vault root)...");
  }

  onOpen() {
    super.onOpen();
    if (this.defaultFolder && this.folders.includes(this.defaultFolder)) {
      this.inputEl.value = this.defaultFolder === "/" ? "/ (vault root)" : this.defaultFolder;
      this.inputEl.dispatchEvent(new Event("input"));
    }
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

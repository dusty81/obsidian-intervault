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

    // Pre-fill search with last-used folder so it's highlighted
    if (defaultFolder && folders.includes(defaultFolder)) {
      this.inputEl.value = defaultFolder === "/" ? "/ (vault root)" : defaultFolder;
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

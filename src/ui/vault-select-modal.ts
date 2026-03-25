import { App, FuzzySuggestModal } from "obsidian";
import { VaultInfo } from "../types";

export class VaultSelectModal extends FuzzySuggestModal<VaultInfo> {
  private vaults: VaultInfo[];
  private onSelect: (vault: VaultInfo) => void;

  constructor(app: App, vaults: VaultInfo[], onSelect: (vault: VaultInfo) => void) {
    super(app);
    this.vaults = vaults;
    this.onSelect = onSelect;
    this.setPlaceholder("Select destination vault...");
  }

  getItems(): VaultInfo[] {
    return this.vaults;
  }

  getItemText(vault: VaultInfo): string {
    return vault.name;
  }

  onChooseItem(vault: VaultInfo): void {
    this.onSelect(vault);
  }
}

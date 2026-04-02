import { App, FuzzySuggestModal } from "obsidian";
import { VaultInfo } from "../types";

export class VaultSelectModal extends FuzzySuggestModal<VaultInfo> {
  private vaults: VaultInfo[];
  private onSelect: (vault: VaultInfo) => void;
  private defaultVaultId: string;

  constructor(app: App, vaults: VaultInfo[], defaultVaultId: string, onSelect: (vault: VaultInfo) => void) {
    super(app);
    this.vaults = vaults;
    this.defaultVaultId = defaultVaultId;
    this.onSelect = onSelect;
    this.setPlaceholder("Select destination vault...");

    // Pre-fill search with last-used vault name so it's highlighted
    if (defaultVaultId) {
      const lastVault = vaults.find((v) => v.id === defaultVaultId);
      if (lastVault) {
        this.inputEl.value = lastVault.name;
        this.inputEl.dispatchEvent(new Event("input"));
      }
    }
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

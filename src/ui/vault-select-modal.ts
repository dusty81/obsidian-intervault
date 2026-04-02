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
  }

  onOpen() {
    super.onOpen();
    if (this.defaultVaultId) {
      const lastVault = this.vaults.find((v) => v.id === this.defaultVaultId);
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

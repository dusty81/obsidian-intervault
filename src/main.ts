import { Plugin, TFile, TFolder, TAbstractFile, Notice, Menu } from "obsidian";
import { InterVaultSettings, DEFAULT_SETTINGS, VaultInfo } from "./types";
import {
  discoverVaults,
  getDestinationFolders,
  getCurrentVaultBasePath,
} from "./vault-discovery";
import { resolveResources, collectFolderFiles } from "./resource-resolver";
import { buildTransferItems, executeTransfer } from "./transfer-engine";
import { VaultSelectModal } from "./ui/vault-select-modal";
import { FolderSelectModal } from "./ui/folder-select-modal";
import {
  TransferOptionsModal,
  TransferOptions,
} from "./ui/transfer-options-modal";
import { InterVaultSettingTab } from "./settings";

export default class InterVaultPlugin extends Plugin {
  settings: InterVaultSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new InterVaultSettingTab(this.app, this));

    // Command: transfer current note
    this.addCommand({
      id: "transfer-current-note",
      name: "Transfer current note to another vault",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          if (!checking) this.startTransfer([file]);
          return true;
        }
        return false;
      },
    });

    // Context menu on files and folders
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        menu.addItem((item) => {
          item
            .setTitle("InterVault: Transfer to another vault")
            .setIcon("folder-input")
            .onClick(() => {
              if (file instanceof TFolder) {
                const files = collectFolderFiles(this.app, file);
                const parentPath = file.parent?.path;
                const basePath = (!parentPath || parentPath === "/") ? "" : parentPath;
                this.startTransfer(files, basePath);
              } else if (file instanceof TFile) {
                this.startTransfer([file]);
              }
            });
        });
      }),
    );

    // Context menu supporting multiple selected files
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu: Menu, files: TAbstractFile[]) => {
        menu.addItem((item) => {
          item
            .setTitle("InterVault: Transfer to another vault")
            .setIcon("folder-input")
            .onClick(() => {
              const tFiles: TFile[] = [];
              for (const f of files) {
                if (f instanceof TFile) {
                  tFiles.push(f);
                } else if (f instanceof TFolder) {
                  tFiles.push(...collectFolderFiles(this.app, f));
                }
              }
              this.startTransfer(tFiles);
            });
        });
      }),
    );
  }

  onunload() {
    // Cleanup handled by Obsidian's registerEvent
  }

  private startTransfer(files: TFile[], sourceBasePath: string | null = null) {
    const sourceVaultPath = getCurrentVaultBasePath(this.app);

    // Step 1: Discover vaults
    let vaults: VaultInfo[];
    try {
      vaults = discoverVaults(sourceVaultPath);
    } catch (err: any) {
      new Notice(`InterVault: ${err.message}`);
      return;
    }

    if (vaults.length === 0) {
      new Notice("InterVault: No other vaults found.");
      return;
    }

    // Step 2: Select vault
    new VaultSelectModal(this.app, vaults, (selectedVault) => {
      // Step 3: Select folder
      const folders = getDestinationFolders(selectedVault.path);
      new FolderSelectModal(this.app, folders, (selectedFolder) => {
        // Step 4: Resolve resources
        const resolved = resolveResources(this.app, files);

        // Step 5: Show options
        new TransferOptionsModal(
          this.app,
          resolved,
          this.settings.defaultMode,
          (options: TransferOptions) => {
            this.executeTransferFlow(
              sourceVaultPath,
              selectedVault,
              selectedFolder,
              resolved,
              options,
              sourceBasePath,
            );
          },
        ).open();
      }).open();
    }).open();
  }

  private async executeTransferFlow(
    sourceVaultPath: string,
    destVault: VaultInfo,
    destFolder: string,
    resolved: ReturnType<typeof resolveResources>,
    options: TransferOptions,
    sourceBasePath: string | null = null,
  ) {
    const items = buildTransferItems(
      sourceVaultPath,
      destVault.path,
      destFolder,
      resolved.primaryFiles,
      resolved.resources,
      options.includeLinkedNotes,
      sourceBasePath,
    );

    const plan = {
      sourceVaultPath,
      destVaultPath: destVault.path,
      destFolder,
      mode: options.mode,
      items,
    };

    const result = await executeTransfer(plan, this.settings, this.app);

    // Report results
    const modeVerb = options.mode === "move" ? "moved" : "copied";
    let msg = `InterVault: ${result.success.length} file(s) ${modeVerb} to ${destVault.name}`;
    if (result.renamed.length > 0) {
      msg += ` (${result.renamed.length} renamed to avoid conflicts)`;
    }
    if (result.failed.length > 0) {
      msg += ` | ${result.failed.length} failed`;
      console.error("InterVault transfer failures:", result.failed);
    }
    new Notice(msg, 8000);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

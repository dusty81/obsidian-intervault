export interface VaultInfo {
  id: string;
  path: string;
  name: string;
}

export type TransferMode = "copy" | "move";

export interface TransferItem {
  /** Absolute source path */
  sourcePath: string;
  /** Path relative to source vault root */
  relativeSourcePath: string;
  /** Path relative to destination vault root */
  relativeDestPath: string;
  /** Whether this is a primary selection or a discovered resource/linked note */
  type: "primary" | "resource" | "linked-note";
}

export interface TransferPlan {
  sourceVaultPath: string;
  destVaultPath: string;
  destFolder: string;
  mode: TransferMode;
  items: TransferItem[];
}

export interface TransferResult {
  success: TransferItem[];
  failed: { item: TransferItem; error: string }[];
  renamed: { item: TransferItem; newName: string }[];
}

export interface InterVaultSettings {
  defaultMode: TransferMode;
  addFrontmatter: boolean;
  lastVaultId: string;
  lastFolder: string;
}

export const DEFAULT_SETTINGS: InterVaultSettings = {
  defaultMode: "copy",
  addFrontmatter: true,
  lastVaultId: "",
  lastFolder: "",
};

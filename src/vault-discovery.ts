import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { App } from "obsidian";
import { VaultInfo } from "./types";

function getObsidianConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  // macOS
  const macPath = join(home, "Library", "Application Support", "obsidian", "obsidian.json");
  if (existsSync(macPath)) return macPath;
  // Windows
  const winPath = join(home, "AppData", "Roaming", "obsidian", "obsidian.json");
  if (existsSync(winPath)) return winPath;
  // Linux
  const linuxPath = join(home, ".config", "obsidian", "obsidian.json");
  if (existsSync(linuxPath)) return linuxPath;

  throw new Error("Could not find Obsidian configuration directory");
}

export function discoverVaults(currentVaultPath: string): VaultInfo[] {
  const configPath = getObsidianConfigPath();
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  const vaults: VaultInfo[] = [];
  for (const [id, entry] of Object.entries(config.vaults || {})) {
    const vaultEntry = entry as { path: string };
    if (!existsSync(vaultEntry.path)) continue;
    if (vaultEntry.path === currentVaultPath) continue;
    vaults.push({
      id,
      path: vaultEntry.path,
      name: basename(vaultEntry.path),
    });
  }

  return vaults.sort((a, b) => a.name.localeCompare(b.name));
}

export function getDestinationFolders(vaultPath: string): string[] {
  const folders: string[] = ["/"];
  const skipDirs = new Set(["node_modules", ".git", ".obsidian", ".trash", "__pycache__"]);

  function walk(dir: string, relative: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (skipDirs.has(entry.name)) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      folders.push(rel);
      walk(join(dir, entry.name), rel);
    }
  }

  walk(vaultPath, "");
  return folders;
}

export function getDestinationAttachmentFolder(vaultPath: string): string {
  const appJsonPath = join(vaultPath, ".obsidian", "app.json");
  if (!existsSync(appJsonPath)) return ".";
  try {
    const config = JSON.parse(readFileSync(appJsonPath, "utf-8"));
    return config.attachmentFolderPath || ".";
  } catch {
    return ".";
  }
}

export function getCurrentVaultBasePath(app: App): string {
  return (app.vault.adapter as any).getBasePath();
}

# InterVault Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that moves/copies notes, folders, and their resources between vaults with full link resolution and metadata tracking.

**Architecture:** The plugin discovers vaults from Obsidian's registry (`~/Library/Application Support/obsidian/obsidian.json`), uses `MetadataCache` to resolve all linked resources within the source vault, then uses Node.js `fs` to transfer files to the destination vault. Links in transferred notes are rewritten to match the destination vault's structure. A series of modals guide the user through vault selection, folder selection, linked note discovery, and copy/move choice.

**Tech Stack:** TypeScript, Obsidian API, Node.js `fs`/`path`, esbuild

---

## File Structure

| File | Responsibility |
|------|---------------|
| `manifest.json` | Plugin metadata (id, name, version, etc.) |
| `package.json` | Dependencies and build scripts |
| `tsconfig.json` | TypeScript configuration |
| `esbuild.config.mjs` | Build configuration |
| `versions.json` | Plugin version to min Obsidian version map |
| `src/main.ts` | Plugin entry point: registers commands, context menu, settings |
| `src/types.ts` | Shared interfaces (`TransferPlan`, `TransferResult`, `VaultInfo`, etc.) |
| `src/vault-discovery.ts` | Reads `obsidian.json`, lists available vaults, reads destination vault config |
| `src/resource-resolver.ts` | Finds all resources/attachments/linked notes for selected files |
| `src/transfer-engine.ts` | Copies/moves files, creates folders, updates links, adds frontmatter |
| `src/link-rewriter.ts` | Rewrites wiki/markdown links in note content for new vault paths |
| `src/ui/vault-select-modal.ts` | FuzzySuggestModal to pick destination vault |
| `src/ui/folder-select-modal.ts` | FuzzySuggestModal to pick folder in destination vault |
| `src/ui/transfer-options-modal.ts` | Modal to choose copy/move, review linked notes, confirm |
| `src/settings.ts` | PluginSettingTab for default behaviors |
| `styles.css` | Plugin styles for modals |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `versions.json`, `.gitignore`, `src/main.ts`, `src/types.ts`, `styles.css`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "id": "obsidian-intervault",
  "name": "InterVault",
  "version": "0.1.0",
  "minAppVersion": "1.6.0",
  "description": "Move and copy notes, folders, and resources between Obsidian vaults.",
  "author": "djs0929",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "obsidian-intervault",
  "version": "0.1.0",
  "description": "Move and copy notes, folders, and resources between Obsidian vaults",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.20.0",
    "obsidian": "latest",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create `esbuild.config.mjs`**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 5: Create `versions.json`**

```json
{
  "0.1.0": "1.6.0"
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
main.js
data.json
.DS_Store
```

- [ ] **Step 7: Create `src/types.ts`**

```ts
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
}

export const DEFAULT_SETTINGS: InterVaultSettings = {
  defaultMode: "copy",
  addFrontmatter: true,
};
```

- [ ] **Step 8: Create minimal `src/main.ts`**

```ts
import { Plugin, Notice } from "obsidian";
import { InterVaultSettings, DEFAULT_SETTINGS } from "./types";

export default class InterVaultPlugin extends Plugin {
  settings: InterVaultSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "transfer-current-note",
      name: "Transfer current note to another vault",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          if (!checking) {
            new Notice("InterVault: Transfer flow not yet implemented");
          }
          return true;
        }
        return false;
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 9: Create empty `styles.css`**

```css
/* InterVault plugin styles */
```

- [ ] **Step 10: Install dependencies and verify build**

Run: `npm install && npm run build`
Expected: `main.js` is generated without errors.

- [ ] **Step 11: Commit**

```bash
git add manifest.json package.json tsconfig.json esbuild.config.mjs versions.json .gitignore src/types.ts src/main.ts styles.css
git commit -m "feat: scaffold InterVault plugin with build tooling and types"
```

---

## Task 2: Vault Discovery

**Files:**
- Create: `src/vault-discovery.ts`

- [ ] **Step 1: Implement vault discovery**

```ts
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/vault-discovery.ts
git commit -m "feat: add vault discovery from Obsidian registry"
```

---

## Task 3: Resource Resolver

**Files:**
- Create: `src/resource-resolver.ts`

- [ ] **Step 1: Implement resource resolution**

This module uses Obsidian's `MetadataCache` to find all resources (embeds, linked files) that a set of notes depends on, and optionally discovers linked notes.

```ts
import { App, TFile, TFolder, TAbstractFile } from "obsidian";
import { TransferItem } from "./types";

export interface ResolvedResources {
  /** The primary notes/files selected by the user */
  primaryFiles: TFile[];
  /** Attachments/resources embedded or linked from primary files (images, PDFs, etc.) */
  resources: TFile[];
  /** Other notes linked from primary files (for optional inclusion) */
  linkedNotes: TFile[];
}

export function resolveResources(app: App, files: TFile[]): ResolvedResources {
  const primarySet = new Set(files.map((f) => f.path));
  const resourcePaths = new Set<string>();
  const linkedNotePaths = new Set<string>();

  for (const file of files) {
    if (file.extension !== "md") continue;
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;

    const allRefs = [
      ...(cache.embeds || []),
      ...(cache.links || []),
      ...(cache.frontmatterLinks || []),
    ];

    for (const ref of allRefs) {
      const linkpath = ref.link.split("#")[0].split("|")[0];
      if (!linkpath) continue;

      const resolved = app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
      if (!resolved) continue;
      if (primarySet.has(resolved.path)) continue;

      if (resolved.extension === "md") {
        linkedNotePaths.add(resolved.path);
      } else {
        resourcePaths.add(resolved.path);
      }
    }
  }

  const getFile = (path: string) => app.vault.getAbstractFileByPath(path) as TFile;

  return {
    primaryFiles: files,
    resources: [...resourcePaths].map(getFile).filter(Boolean),
    linkedNotes: [...linkedNotePaths].map(getFile).filter(Boolean),
  };
}

export function collectFolderFiles(app: App, folder: TFolder): TFile[] {
  const files: TFile[] = [];

  function walk(node: TAbstractFile) {
    if (node instanceof TFile) {
      files.push(node);
    } else if (node instanceof TFolder) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(folder);
  return files;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/resource-resolver.ts
git commit -m "feat: add resource resolver using MetadataCache"
```

---

## Task 4: Link Rewriter

**Files:**
- Create: `src/link-rewriter.ts`

- [ ] **Step 1: Implement link rewriting**

This module takes note content and a path mapping, then rewrites all wiki-style and markdown-style links/embeds to use updated paths.

```ts
export interface PathMapping {
  /** Old path relative to source vault root */
  oldPath: string;
  /** New path relative to destination vault root */
  newPath: string;
}

export function rewriteLinks(content: string, mappings: PathMapping[]): string {
  if (mappings.length === 0) return content;

  // Build lookups: old full path -> new full path, old basename -> new full path
  const byOldPath = new Map<string, string>();
  const byBasename = new Map<string, string>();

  for (const m of mappings) {
    byOldPath.set(m.oldPath, m.newPath);
    const oldBase = m.oldPath.split("/").pop()!;
    // Only map basename if it's unambiguous
    if (!byBasename.has(oldBase)) {
      byBasename.set(oldBase, m.newPath);
    } else {
      // Ambiguous — remove so we don't rewrite incorrectly
      byBasename.delete(oldBase);
    }
  }

  // Rewrite wiki-style links and embeds: [[path]] and ![[path]]
  // Wiki links use shortest-path basenames and strip .md
  content = content.replace(
    /(!?)\[\[([^\]|#]+)(#[^\]|]*)?((?:\|[^\]]*)?)\]\]/g,
    (match, bang, linkPath, heading, alias) => {
      const trimmed = linkPath.trim();
      const newFullPath = findNewPath(trimmed, byOldPath, byBasename);
      if (newFullPath !== null) {
        // Wiki links use basename without .md extension
        const newBase = newFullPath.split("/").pop()!.replace(/\.md$/, "");
        return `${bang}[[${newBase}${heading || ""}${alias || ""}]]`;
      }
      return match;
    }
  );

  // Rewrite markdown-style links: [text](path) and ![alt](path)
  // Markdown links use the full relative path with extension
  content = content.replace(
    /(!?)\[([^\]]*)\]\(([^)#]+)(#[^)]*)?\)/g,
    (match, bang, text, linkPath, heading) => {
      const trimmed = decodeURIComponent(linkPath.trim());
      const newFullPath = findNewPath(trimmed, byOldPath, byBasename);
      if (newFullPath !== null) {
        const encoded = newFullPath.replace(/ /g, "%20");
        return `${bang}[${text}](${encoded}${heading || ""})`;
      }
      return match;
    }
  );

  return content;
}

function findNewPath(
  linkTarget: string,
  byOldPath: Map<string, string>,
  byBasename: Map<string, string>
): string | null {
  // Try exact full path match first
  if (byOldPath.has(linkTarget)) {
    return byOldPath.get(linkTarget)!;
  }

  // Try matching by basename (how Obsidian shortest-path links work)
  const base = linkTarget.split("/").pop()!;
  if (byBasename.has(base)) {
    return byBasename.get(base)!;
  }

  // Try with .md extension added (wiki links omit .md)
  const withMd = base.endsWith(".md") ? base : `${base}.md`;
  if (byBasename.has(withMd)) {
    return byBasename.get(withMd)!;
  }

  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/link-rewriter.ts
git commit -m "feat: add link rewriter for wiki and markdown links"
```

---

## Task 5: Transfer Engine

**Files:**
- Create: `src/transfer-engine.ts`

- [ ] **Step 1: Implement the transfer engine**

This is the core module that executes the transfer plan: copies/moves files, creates directories, rewrites links, and adds frontmatter.

```ts
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join, dirname, basename, extname } from "path";
import { App, TFile, Notice } from "obsidian";
import {
  TransferPlan,
  TransferItem,
  TransferResult,
  InterVaultSettings,
} from "./types";
import { rewriteLinks, PathMapping } from "./link-rewriter";
import { getDestinationAttachmentFolder } from "./vault-discovery";

export function buildTransferItems(
  sourceVaultPath: string,
  destVaultPath: string,
  destFolder: string,
  primaryFiles: TFile[],
  resources: TFile[],
  linkedNotes: TFile[],
  /** Common prefix to strip from primary file paths (e.g., the selected folder's path). Empty string for single-file transfers. */
  sourceBasePath: string = "",
): TransferItem[] {
  const items: TransferItem[] = [];
  const destAttachmentFolder = getDestinationAttachmentFolder(destVaultPath);

  // Primary files: placed in destFolder, preserving relative structure under sourceBasePath
  for (const file of primaryFiles) {
    // Strip the common source folder prefix so we preserve only the relative structure
    const relativeName = sourceBasePath && file.path.startsWith(sourceBasePath + "/")
      ? file.path.slice(sourceBasePath.length + 1)
      : file.name;
    const relDest =
      destFolder === "/" ? relativeName : `${destFolder}/${relativeName}`;
    items.push({
      sourcePath: join(sourceVaultPath, file.path),
      relativeSourcePath: file.path,
      relativeDestPath: relDest,
      type: "primary",
    });
  }

  // Linked notes: placed flat in destFolder (they come from various locations)
  for (const file of linkedNotes) {
    const relDest =
      destFolder === "/" ? file.name : `${destFolder}/${file.name}`;
    items.push({
      sourcePath: join(sourceVaultPath, file.path),
      relativeSourcePath: file.path,
      relativeDestPath: relDest,
      type: "linked-note",
    });
  }

  // Resources: placed according to destination attachment folder config
  for (const file of resources) {
    let relDest: string;
    if (destAttachmentFolder === ".") {
      // Same folder as note — use destFolder
      relDest =
        destFolder === "/" ? file.name : `${destFolder}/${file.name}`;
    } else if (destAttachmentFolder.startsWith("./")) {
      // Relative to note folder
      const sub = destAttachmentFolder.slice(2);
      relDest =
        destFolder === "/"
          ? `${sub}/${file.name}`
          : `${destFolder}/${sub}/${file.name}`;
    } else {
      // Absolute from vault root
      relDest = `${destAttachmentFolder}/${file.name}`;
    }
    items.push({
      sourcePath: join(sourceVaultPath, file.path),
      relativeSourcePath: file.path,
      relativeDestPath: relDest,
      type: "resource",
    });
  }

  return items;
}

function resolveConflict(destAbsPath: string): string {
  if (!existsSync(destAbsPath)) return destAbsPath;

  const dir = dirname(destAbsPath);
  const ext = extname(destAbsPath);
  const base = basename(destAbsPath, ext);

  let counter = 1;
  let candidate: string;
  do {
    candidate = join(dir, `${base} (${counter})${ext}`);
    counter++;
  } while (existsSync(candidate));

  return candidate;
}

export function executeTransfer(
  plan: TransferPlan,
  settings: InterVaultSettings,
  app: App,
): TransferResult {
  const result: TransferResult = { success: [], failed: [], renamed: [] };

  // Build path mappings for link rewriting
  const pathMappings: PathMapping[] = plan.items.map((item) => ({
    oldPath: item.relativeSourcePath,
    newPath: item.relativeDestPath,
  }));

  for (const item of plan.items) {
    try {
      let destAbsPath = join(plan.destVaultPath, item.relativeDestPath);

      // Handle conflict
      const resolvedPath = resolveConflict(destAbsPath);
      if (resolvedPath !== destAbsPath) {
        const newName = basename(resolvedPath);
        result.renamed.push({ item, newName });
        destAbsPath = resolvedPath;
      }

      // Ensure parent directory exists
      const parentDir = dirname(destAbsPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      // For markdown files: rewrite links and add frontmatter
      if (item.sourcePath.endsWith(".md")) {
        let content = readFileSync(item.sourcePath, "utf-8");

        // Rewrite links
        content = rewriteLinks(content, pathMappings);

        // Add frontmatter
        if (settings.addFrontmatter) {
          content = addTransferFrontmatter(
            content,
            basename(plan.sourceVaultPath),
            item.relativeSourcePath,
          );
        }

        writeFileSync(destAbsPath, content, "utf-8");
      } else {
        // Binary file: straight copy
        copyFileSync(item.sourcePath, destAbsPath);
      }

      result.success.push(item);
    } catch (err: any) {
      result.failed.push({ item, error: err.message || String(err) });
    }
  }

  // Delete source files if mode is "move"
  if (plan.mode === "move") {
    for (const item of result.success) {
      try {
        const file = app.vault.getAbstractFileByPath(item.relativeSourcePath);
        if (file) {
          app.vault.trash(file, false);
        }
      } catch (err: any) {
        // File already transferred; log but don't fail
        console.warn(`InterVault: failed to delete source ${item.relativeSourcePath}:`, err);
      }
    }
  }

  return result;
}

function addTransferFrontmatter(
  content: string,
  sourceVaultName: string,
  sourceRelPath: string,
): string {
  const date = new Date().toISOString().split("T")[0];
  const newFields = `moved-from: "[[${sourceVaultName}/${sourceRelPath}]]"\nmoved-date: ${date}`;

  // Check if frontmatter already exists
  if (content.startsWith("---\n")) {
    const endIdx = content.indexOf("\n---", 4);
    if (endIdx !== -1) {
      const before = content.slice(0, endIdx);
      const after = content.slice(endIdx);
      return `${before}\n${newFields}${after}`;
    }
  }

  // No existing frontmatter — add it
  return `---\n${newFields}\n---\n${content}`;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/transfer-engine.ts
git commit -m "feat: add transfer engine with link rewriting and frontmatter"
```

---

## Task 6: UI - Vault Select Modal

**Files:**
- Create: `src/ui/vault-select-modal.ts`

- [ ] **Step 1: Implement vault selection modal**

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/vault-select-modal.ts
git commit -m "feat: add vault selection modal"
```

---

## Task 7: UI - Folder Select Modal

**Files:**
- Create: `src/ui/folder-select-modal.ts`

- [ ] **Step 1: Implement folder selection modal**

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/folder-select-modal.ts
git commit -m "feat: add folder selection modal"
```

---

## Task 8: UI - Transfer Options Modal

**Files:**
- Create: `src/ui/transfer-options-modal.ts`

- [ ] **Step 1: Implement transfer options modal**

This modal shows the user what will be transferred, lets them toggle linked notes, and choose copy vs move.

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/transfer-options-modal.ts
git commit -m "feat: add transfer options modal with linked note toggles"
```

---

## Task 9: Wire Everything Together in Main

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Implement the full plugin flow**

Replace `src/main.ts` with the complete wired-up version:

```ts
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
                this.startTransfer(files, file.path);
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

  private startTransfer(files: TFile[], sourceBasePath: string = "") {
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

  private executeTransferFlow(
    sourceVaultPath: string,
    destVault: VaultInfo,
    destFolder: string,
    resolved: ReturnType<typeof resolveResources>,
    options: TransferOptions,
    sourceBasePath: string = "",
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

    const result = executeTransfer(plan, this.settings, this.app);

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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire up complete transfer flow in main plugin"
```

---

## Task 10: Settings Tab

**Files:**
- Create: `src/settings.ts`

- [ ] **Step 1: Implement settings tab**

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type InterVaultPlugin from "./main";

export class InterVaultSettingTab extends PluginSettingTab {
  plugin: InterVaultPlugin;

  constructor(app: App, plugin: InterVaultPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "InterVault Settings" });

    new Setting(containerEl)
      .setName("Default transfer mode")
      .setDesc("Default selection when the transfer dialog opens")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("copy", "Copy")
          .addOption("move", "Move")
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultMode = value as "copy" | "move";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Add transfer metadata")
      .setDesc("Add moved-from and moved-date to frontmatter of transferred notes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.addFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.addFrontmatter = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add plugin settings tab"
```

---

## Task 11: Styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add modal styles**

```css
.intervault-options-modal {
  padding: 1em;
}

.intervault-summary {
  margin-bottom: 1em;
  padding: 0.5em 1em;
  background: var(--background-secondary);
  border-radius: 8px;
}

.intervault-summary p {
  margin: 0.25em 0;
  color: var(--text-muted);
}

.intervault-buttons {
  margin-top: 1em;
  display: flex;
  justify-content: flex-end;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add modal styles"
```

---

## Task 12: Final Build and Integration Test

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `main.js` generated, no errors.

- [ ] **Step 2: Manual integration test**

1. Copy `main.js`, `manifest.json`, and `styles.css` into an Obsidian vault's `.obsidian/plugins/obsidian-intervault/` directory.
2. Enable the plugin in Obsidian Settings > Community plugins.
3. Test:
   - Right-click a single note > "InterVault: Transfer to another vault"
   - Select a vault, folder, review linked notes, choose copy
   - Verify the note + attachments appear in destination with correct links
   - Verify frontmatter was added
   - Repeat with "move" — verify source is deleted
   - Test with a folder right-click
   - Test conflict resolution (transfer same note twice)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete InterVault plugin v0.1.0"
```

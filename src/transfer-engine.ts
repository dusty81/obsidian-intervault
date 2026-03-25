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
  /** Parent path to strip from primary file paths. null = single-file mode (use filename only). "" = vault root folder. "path" = nested folder parent. */
  sourceBasePath: string | null = null,
): TransferItem[] {
  const items: TransferItem[] = [];
  const destAttachmentFolder = getDestinationAttachmentFolder(destVaultPath);

  // Primary files: placed in destFolder, preserving relative structure
  for (const file of primaryFiles) {
    let relativeName: string;
    if (sourceBasePath === null) {
      // Single file transfer — just use the filename
      relativeName = file.name;
    } else if (sourceBasePath === "") {
      // Folder at vault root — keep full vault-relative path (preserves folder name + structure)
      relativeName = file.path;
    } else if (file.path.startsWith(sourceBasePath + "/")) {
      // Nested folder — strip parent prefix, keeping folder name + structure
      relativeName = file.path.slice(sourceBasePath.length + 1);
    } else {
      relativeName = file.path;
    }
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

export async function executeTransfer(
  plan: TransferPlan,
  settings: InterVaultSettings,
  app: App,
): Promise<TransferResult> {
  const result: TransferResult = { success: [], failed: [], renamed: [] };

  // First pass: resolve all conflicts and determine final destination paths
  const resolvedItems: { item: TransferItem; destAbsPath: string; finalRelDest: string }[] = [];
  for (const item of plan.items) {
    let destAbsPath = join(plan.destVaultPath, item.relativeDestPath);
    const resolvedPath = resolveConflict(destAbsPath);
    let finalRelDest = item.relativeDestPath;
    if (resolvedPath !== destAbsPath) {
      const newName = basename(resolvedPath);
      result.renamed.push({ item, newName });
      destAbsPath = resolvedPath;
      // Update the relative dest path to reflect the rename
      const dir = dirname(item.relativeDestPath);
      finalRelDest = dir === "." ? newName : `${dir}/${newName}`;
    }
    resolvedItems.push({ item, destAbsPath, finalRelDest });
  }

  // Build path mappings AFTER conflict resolution using final paths
  const pathMappings: PathMapping[] = resolvedItems.map(({ item, finalRelDest }) => ({
    oldPath: item.relativeSourcePath,
    newPath: finalRelDest,
  }));

  // Second pass: write files with correct mappings
  for (const { item, destAbsPath } of resolvedItems) {
    try {
      const parentDir = dirname(destAbsPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      if (item.sourcePath.endsWith(".md")) {
        let content = readFileSync(item.sourcePath, "utf-8");
        content = rewriteLinks(content, pathMappings);
        if (settings.addFrontmatter) {
          content = addTransferFrontmatter(
            content,
            basename(plan.sourceVaultPath),
            item.relativeSourcePath,
          );
        }
        writeFileSync(destAbsPath, content, "utf-8");
      } else {
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
          await app.vault.trash(file, false);
        }
      } catch (err: any) {
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
  const safeVaultName = sourceVaultName.replace(/"/g, '\\"');
  const safePath = sourceRelPath.replace(/"/g, '\\"');
  const newFields = `moved-from: "[[${safeVaultName}/${safePath}]]"\nmoved-date: ${date}`;

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

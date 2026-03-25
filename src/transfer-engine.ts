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

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

  const getFile = (path: string): TFile | null => {
    const f = app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  };

  return {
    primaryFiles: files,
    resources: ([...resourcePaths].map(getFile).filter((f): f is TFile => f !== null)),
    linkedNotes: ([...linkedNotePaths].map(getFile).filter((f): f is TFile => f !== null)),
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

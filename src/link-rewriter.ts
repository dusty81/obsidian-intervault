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

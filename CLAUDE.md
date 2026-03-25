# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `npm run build` — Type-check with `tsc` then bundle with esbuild to `main.js` (production)
- `npm run dev` — esbuild watch mode with inline sourcemaps

The plugin is symlinked into all local Obsidian vaults at `~/.obsidian/plugins/obsidian-intervault/`. After building, reload Obsidian (or disable/re-enable the plugin) to pick up changes.

## Architecture

This is a desktop-only Obsidian plugin (`isDesktopOnly: true`) that transfers notes, folders, and attachments between vaults. It uses Node.js `fs` for cross-vault file operations since Obsidian's Vault API only sees the current vault.

### Transfer Flow

```
User trigger (command palette or right-click context menu)
  → discoverVaults() reads ~/Library/Application Support/obsidian/obsidian.json
  → VaultSelectModal (pick destination vault)
  → FolderSelectModal (pick destination folder)
  → resolveResources() uses MetadataCache to find attachments + linked notes
  → TransferOptionsModal (copy/move choice, linked note toggles)
  → buildTransferItems() creates transfer plan with path mappings
  → executeTransfer() two-pass: resolve conflicts first, then write with correct link rewrites
```

### Module Dependency Graph

```
main.ts (Plugin entry, orchestrates flow)
  ├── vault-discovery.ts    (reads obsidian.json, enumerates vaults/folders, reads attachment config)
  ├── resource-resolver.ts  (MetadataCache: embeds, links, frontmatterLinks → resources + linked notes)
  ├── transfer-engine.ts    (buildTransferItems, executeTransfer, conflict resolution, frontmatter)
  │     └── link-rewriter.ts (rewrites [[wiki]] and [md](links) using path mappings)
  ├── settings.ts           (PluginSettingTab)
  └── ui/                   (VaultSelectModal, FolderSelectModal, TransferOptionsModal)
```

### Key Design Decisions

- **Cross-vault I/O uses Node.js `fs`**, not Obsidian's Vault API. Source deletion uses `app.vault.trash()` to respect Obsidian's trash system.
- **Link rewriting** uses two lookup strategies: exact path match, then basename fallback. Ambiguous basenames (two files with same name) are excluded from basename matching to avoid incorrect rewrites. Wiki links rewrite to basename without `.md`; markdown links preserve full path with extension.
- **Conflict resolution** renames with ` (1)`, ` (2)` suffixes. Conflicts are resolved in a first pass BEFORE link rewriting so path mappings reflect final destinations.
- **`executeTransfer` is async** because `app.vault.trash()` returns a Promise.
- **Folder transfer** passes parent folder path as `sourceBasePath` (not the folder's own path) so the folder name and internal structure are preserved. `null` = single-file mode, `""` = vault-root folder, `"path"` = nested folder parent.
- **Attachment placement** respects destination vault's `attachmentFolderPath` from `.obsidian/app.json` (same folder, relative subfolder, or absolute from vault root).
- **Empty folder cleanup** after moves walks parent folders bottom-up, only when all transfers succeeded.

## Testing

No automated test framework. Test manually by installing in an Obsidian vault and exercising:
- Single note copy/move
- Folder copy/move (verify structure preserved)
- Notes with attachments (images, PDFs)
- Conflict resolution (transfer same file twice)
- Linked note inclusion
- Frontmatter metadata injection

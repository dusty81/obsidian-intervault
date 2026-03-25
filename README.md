# obsidian-intervault

Plugin to move and copy notes, folders, and resources between Obsidian vaults.

## Features

- Transfer single notes, multiple notes, or entire folders between vaults
- Auto-discovers all vaults registered with Obsidian
- Copies all referenced attachments (images, PDFs, etc.) along with notes
- Optionally includes linked notes
- Rewrites internal links to work in the destination vault
- Respects the destination vault's attachment folder configuration
- Adds transfer metadata (moved-from, moved-date) to frontmatter
- Handles filename conflicts by renaming with a numeric suffix
- Choose between copy (keep original) or move (delete original)

## Warning

**Back up your data before performing moves.** Move operations delete the original files from the source vault after transfer. While the plugin uses Obsidian's trash (not permanent deletion), you should always have a backup in case of unexpected behavior.

## Usage

1. Right-click a note, folder, or multi-selection in the file explorer
2. Select "InterVault: Transfer to another vault"
3. Pick the destination vault
4. Pick the destination folder
5. Review linked notes and choose copy or move
6. Confirm the transfer

You can also use the command palette: "Transfer current note to another vault"

## Settings

- **Default transfer mode** - Whether the dialog defaults to Copy or Move
- **Add transfer metadata** - Toggle frontmatter injection (moved-from, moved-date)

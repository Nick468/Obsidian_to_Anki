# My Fork of Obsidian_to_Anki
This is my fork of [Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki) (Plugin to add flashcards from a text or markdown file to Anki). My fork significantly reduces the general usability, but has many improvements for creating Anki cards with the [Header Paragraph Style](https://github.com/ObsidianToAnki/Obsidian_to_Anki/wiki/Header-paragraph-style). If you have exactly my usecase (wirting a summary of something in obsidian, using this plugin to convert it to anki cards for studying) you may find this plugin useful. If not however, don't use this plugin.

## Things no longer working
- [x] Removing all tests
- [x] Removing the python scripts
- [x] Notes other than regex notes are no longer supported (only commented out, I don't have a usecase and don't want to test. Might work, might not...)

## Bugs I fixed
- [x] Fixed many internal regex strings leading to false positives, false negatives, catastrophic backtracking...
- [x] Allow duplicate cards (same title)
- [x] Have empty line between text and id comment (fixes lists in markdown syntax)
- [x] Parse --- correctly
- [x] Fix Math Regex handling
- [x] Remove block links from cards
- [x] Remove obsidian comments from cards
- [x] Format strikethrough correctly on anki card

## Featrues I added
- [x] New UI with scan current file only and scan selected folder
- [x] Handling of callouts
- [x] Handling of mermaid graphs (needs special anki card)
- [x] Insert link on anki card to open the correct section of the obsidian note directly (not just the entire note)
- [x] Mirror the obsidian directory as the anki deck structure
- [x] Added support for webp images
- [x] Support for a link in id comment to overwrite the anki deck (allows you to save a card (section of a note) in a differernt deck)
- [x] Implement custom clozing system
- [ ] PDF support

# My Fork of Obsidian_to_Anki
This is my fork of [Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki) (Plugin to add flashcards from a text or markdown file to Anki). It started out as a few simple modifications, but I found the codebase so convoluted that I pretty much rewrote the entire project. I added some features I thought were lacking in the origianl and tried to keep as much of the old functionality as was reasonable. 

## Caution
- This fork is far less tested. There will be bugs.
- This fork is not 100 % compatible with the original project. The anki cards *should* transfer over, but you will have to setup the plugin from scratch and get used to a few quirks.

## Things no longer working
- [x] Removing all tests
- [x] Removing the python scripts

## Stuff I changed
- [x] rewrote *almost* everything to make future modifications easier
- [x] Fixed many internal regex strings leading to false positives, false negatives, catastrophic backtracking...
	- use  `^#+\s(.+)\n*((?:\n+(?!#+\s|<!--ID:|%%ID:).+)+)` as [Header-Paragraph-Style](https://github.com/ObsidianToAnki/Obsidian_to_Anki/wiki/Header-paragraph-style)
- [x] New markdown renderer (obsidian's inbuilt one, not showdown)
	- [x] Make embeds of markdown files possible
	- [x] Parse markdown-horizontal lines correctly
	- [x] Fix Math Regex handling
	- [x] Remove block links from cards
	- [x] Remove obsidian comments from cards
	- [x] Format strikethrough correctly on anki card
	- [x] Handling of callouts
	- [x] Handling of mermaid graphs (needs special anki card)
	- [x] Added support for webp images
- [x] New UI
	- [x] New settings page
	- [x] New Interface for scan current file only and scan selected folder (right clicking)
- [x] Insert link on anki card to open the correct section of the obsidian note directly (not just the entire note)
- [x] Mirror the obsidian directory as the anki deck structure
- [x] Support for a link in id comment to overwrite the anki deck (allows you to save a card (section of a note) in a differernt deck)
- [x] Implement custom clozing system
- [x] Added extra field which will not get updated by the plugin -> you can write to it in anki and the field will not get deleted when updating the card
- [ ] PDF support
- [ ] Initiate second anki request to deleete empty decks

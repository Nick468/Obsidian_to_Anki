import { App, PluginSettingTab, Setting, Notice, TFolder } from 'obsidian'
import obsidian_to_anki_plugin from '../main';

const defaultDescs = {
	ScanDirectory: ["Scan Directory", "The directory to scan. Leave empty to scan the entire vault"],
	GlobalTag: ["Global Tag", "The tag that the plugin automatically adds to any generated cards."],
	GlobalDeck: ["Global Deck", "The deck the plugin adds cards to if TARGET DECK is not specified in the file."],
	EmbedColour: ["Colour of embeds", "Colour of markdown file embeds"],
	SchedulingInterval: ["Scheduling Interval", "The time, in minutes, between automatic scans of the vault. Set this to 0 to disable automatic scanning."],
	AddFileLink: ["Add File Link", "Append a link to the file that generated the flashcard on the field specified in the table."],
	AddContext: ["Add Context", "Append 'context' for the card, in the form of path > heading > heading etc, to the field specified in the table."],
	IDComments: ["Id Comments", "Wrap note IDs in a HTML comment."],
	AddObsidianTags: ["Add Obsidian Tags", "Interpret #tags in the fields of a note as Anki tags, removing them from the note text in Anki."],
	CurlyCloze: ["Curly Cloze", "Convert {cloze deletions} -> {{c1::cloze deletions}} on note types that have a 'Cloze' in their name."],
	HighlightsToCloze: ["Highlights to Cloze", "Convert ==highlights== -> {highlights} to be processed by CurlyCloze."],
	AnkiCustomCloze: ["Anki Custom Cloze", "Does not use the default anki cloze system (instead JS card) to allow normal notes and clozed notes in one note type."],
	MirrorObsidianStructure:["Mirror Obsidian Folder Structure", "Uses the path of a file in obsidian as the deck."]
}

export const DEFAULT_IGNORED_FILE_GLOBS = [
	'**/*.excalidraw.md'
];

export class SettingsTab extends PluginSettingTab {

	plugin: obsidian_to_anki_plugin;

	constructor(app: App, plugin: obsidian_to_anki_plugin){
		super(app, plugin)
		this.plugin = plugin
	}

	setup_note_field(note_type: string, row_cells: HTMLCollection){
		let note_field = new Setting(row_cells[0] as HTMLElement)
		.addDropdown(
			async dropdown => {
				const note_types = this.plugin.note_types
				for (let note_type of note_types) {
					dropdown.addOption(note_type, note_type)
				}
				dropdown.setValue(
					note_type
				)
				dropdown.onChange(async (value) => {
					this.plugin.settings.noteTypes[value] = structuredClone(this.plugin.settings.noteTypes[note_type])
					this.plugin.settings.noteTypes[note_type].custom_regexp = ""
					await this.plugin.saveAllData()
					this.display()
				})
			}
		)
	note_field.settingEl = row_cells[0] as HTMLElement
	note_field.infoEl.remove()
	note_field.controlEl.className += " anki-center"
	}

	setup_custom_regexp(note_type: string, row_cells: HTMLCollection) {
		let custom_regexp = new Setting(row_cells[1] as HTMLElement)
			.addText(
					text => text.setValue(
						this.plugin.settings.noteTypes[note_type].custom_regexp ? this.plugin.settings.noteTypes[note_type].custom_regexp : ""
					)
					.onChange(async (value) => {
						this.plugin.settings.noteTypes[note_type].custom_regexp = value
						await this.plugin.saveAllData()
						if(value == "") // delete this note
							this.display()
					})
			)
		custom_regexp.settingEl = row_cells[1] as HTMLElement
		custom_regexp.infoEl.remove()
		custom_regexp.controlEl.className += " anki-center"
	}

	setup_link_field(note_type: string, row_cells: HTMLCollection) {
		let link_field = new Setting(row_cells[2] as HTMLElement)
			.addDropdown(
				async dropdown => {
					let field_names: string[] = [""]
					field_names.push(...this.plugin.fields_dict[note_type])
					for (let field of field_names) {
						dropdown.addOption(field, field)
					}
					dropdown.setValue(
						this.plugin.settings.noteTypes[note_type].file_link_field ? this.plugin.settings.noteTypes[note_type].file_link_field : field_names[0]
					)
					dropdown.onChange(async (value) => {
						this.plugin.settings.noteTypes[note_type].file_link_field = value
						await this.plugin.saveAllData()
					})
				}
			)
		link_field.settingEl = row_cells[2] as HTMLElement
		link_field.infoEl.remove()
		link_field.controlEl.className += " anki-center"
	}

	setup_context_field(note_type: string, row_cells: HTMLCollection) {
		let context_field = new Setting(row_cells[3] as HTMLElement)
			.addDropdown(
				async dropdown => {
					let field_names: string[] = [""]
					field_names.push(...this.plugin.fields_dict[note_type])
					for (let field of field_names) {
						dropdown.addOption(field, field)
					}
					dropdown.setValue(
						this.plugin.settings.noteTypes[note_type].context_field ? this.plugin.settings.noteTypes[note_type].context_field : field_names[0]
					)
					dropdown.onChange(async (value) => {
						this.plugin.settings.noteTypes[note_type].context_field = value
						await this.plugin.saveAllData()
					})
				}
			)
		context_field.settingEl = row_cells[3] as HTMLElement
		context_field.infoEl.remove()
		context_field.controlEl.className += " anki-center"
	}

	setup_extra_field(note_type: string, row_cells: HTMLCollection){
		let extra_field = new Setting(row_cells[4] as HTMLElement)
		.addDropdown(
			async dropdown => {
				let field_names: string[] = [""]
				field_names.push(...this.plugin.fields_dict[note_type])
				for (let field of field_names) {
					dropdown.addOption(field, field)
				}
				dropdown.setValue(
					this.plugin.settings.noteTypes[note_type].extra_field ? this.plugin.settings.noteTypes[note_type].extra_field : field_names[0]
				)
				dropdown.onChange(async (value) => {
					this.plugin.settings.noteTypes[note_type].extra_field = value
					await this.plugin.saveAllData()
				})
			}
		)
	extra_field.settingEl = row_cells[4] as HTMLElement
	extra_field.infoEl.remove()
	extra_field.controlEl.className += " anki-center"
	}

	async setup_note_table() {
		let {containerEl} = this;
		containerEl.createEl('h3', {text: 'Regex Note Type Settings'})

		let regexNotes: boolean = false

		for (let note_type of this.plugin.note_types) {
			if(this.plugin.settings.noteTypes[note_type].custom_regexp.length == 0)
				continue
			
			regexNotes = true
			break
		}
		
		let note_type_table = containerEl.createEl('table', {cls: "anki-settings-table"})
		let head = note_type_table.createTHead()
		let header_row = head.insertRow()
		for (let header of ["Note Type", "Custom Regexp", "File Link Field", "Context Field", "Extra Field"]) {
			let th = document.createElement("th")
			th.appendChild(document.createTextNode(header))
			header_row.appendChild(th)
		}
		let main_body = note_type_table.createTBody()
		
		for (let note_type of this.plugin.note_types) {
			if(this.plugin.settings.noteTypes[note_type].custom_regexp.length == 0)
				continue

			note_type_table.style.display = 'table'
			let row = main_body.insertRow()

			row.insertCell()
			row.insertCell()
			row.insertCell()
			row.insertCell()
			row.insertCell()

			let row_cells = row.children

			this.setup_note_field(note_type, row_cells)
			this.setup_custom_regexp(note_type, row_cells)
			this.setup_link_field(note_type, row_cells)
			this.setup_context_field(note_type, row_cells)
			this.setup_extra_field(note_type, row_cells)
		}

		new Setting(containerEl)
		.setName("Add new note type")
		.addButton(
			button => {
				button.setButtonText("Add").setClass("mod-cta")
				.onClick(async () => {
					for(let note_type of this.plugin.note_types){
						if(this.plugin.settings.noteTypes[note_type].custom_regexp == ""){
							this.plugin.settings.noteTypes[note_type].custom_regexp = "Change Me"
							await this.plugin.saveAllData
							this.display()
							break
						}
					}
				})
			}
		)
	}

	createCollapsibleDiv(): HTMLDivElement {
		// Create the main div container
		let {containerEl} = this;
		containerEl = containerEl.createEl('div');
		containerEl.style.padding = '10px';
		containerEl.style.width = 'fit-content';
	
		// Create the button to toggle collapse/expand
		const toggleButton = document.createElement('button');
		toggleButton.textContent = 'Expand';
		toggleButton.style.marginBottom = '10px';
		toggleButton.style.cursor = 'pointer';
	
		// Create the div that will contain the content
		const contentDiv = document.createElement('div');
		contentDiv.style.display = 'none'; // Collapsed by default
		
		// Add event listener to the button to toggle visibility
		toggleButton.addEventListener('click', () => {
			if (contentDiv.style.display === 'none') {
				contentDiv.style.display = 'block';
				toggleButton.textContent = 'Collapse';
			} else {
				contentDiv.style.display = 'none';
				toggleButton.textContent = 'Expand';
			}
		});
	
		// Append the button and content div to the main container
		containerEl.appendChild(toggleButton);
		containerEl.appendChild(contentDiv);
	
		return contentDiv;
	}

	setup_syntax() {
		let {containerEl} = this;
		containerEl.createEl('h3', {text: 'Non-regex Note Settings'})
		let div = this.createCollapsibleDiv()
		for (let key of Object.keys(this.plugin.settings["Syntax"])) {
			new Setting(div)
				.setName(key)
				.addText(
						text => text.setValue(this.plugin.settings["Syntax"][key])
						.onChange(async (value) => {
							this.plugin.settings["Syntax"][key] = value
							await this.plugin.saveAllData()
						})
				)
		}
	}

	setup_defaults() {
		let {containerEl} = this;
		let defaults_settings = containerEl.createEl('h3', {text: 'General settings'})

		for (let key of Object.keys(this.plugin.settings.Defaults)) {
			// To account for removal of regex setting
			if (key === "Regex") {
				continue
			}

			if (typeof this.plugin.settings.Defaults[key] === "string") {
				new Setting(defaults_settings)
					.setName(defaultDescs[key][0])
					.setDesc(defaultDescs[key][1])
					.addText(
						text => text.setValue(this.plugin.settings.Defaults[key])
						.onChange(async (value) => {
							this.plugin.settings.Defaults[key] = value
							await this.plugin.saveAllData()
						})
				)
			} else if (typeof this.plugin.settings.Defaults[key] === "boolean") {
				new Setting(defaults_settings)
					.setName(defaultDescs[key][0])
					.setDesc(defaultDescs[key][1])
					.addToggle(
						toggle => toggle.setValue(this.plugin.settings.Defaults[key])
						.onChange(async (value) => {
							this.plugin.settings.Defaults[key] = value
							await this.plugin.saveAllData()
						})
					)
			} else {
				new Setting(defaults_settings)
					.setName(defaultDescs[key][0])
					.setDesc(defaultDescs[key][1])
					.addSlider(
						slider => {
							slider.setValue(this.plugin.settings.Defaults[key])
							.setLimits(0, 360, 5)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.Defaults[key] = value
								await this.plugin.saveAllData()

							})
					}
					)
			}
		}
	}

	get_folders(): TFolder[] {
		let folder_list: TFolder[] = [this.plugin.app.vault.getRoot()]
		for (let folder of folder_list) {
			let filtered_list: TFolder[] = folder.children.filter((element) => element.hasOwnProperty("children")) as TFolder[]
			folder_list.push(...filtered_list)
		}
		return folder_list.slice(1) //Removes initial vault folder
	}

	setup_folder_field(folder: TFolder, row_cells: HTMLCollection){
		let folder_deck = new Setting(row_cells[0] as HTMLElement)
			.addText(
				text => text.setValue(folder.path)
				.onChange(async (value) => {
					if(this.app.vault.getFolderByPath(value)){
						this.plugin.settings.FOLDER_DECKS[value] = structuredClone(this.plugin.settings.FOLDER_DECKS[folder.path])
						this.plugin.settings.FOLDER_TAGS[value] = structuredClone(this.plugin.settings.FOLDER_TAGS[folder.path])
						this.plugin.settings.FOLDER_DECKS[folder.path] = ""
						this.plugin.settings.FOLDER_TAGS[folder.path] = ""
						folder_deck.settingEl.style.background = "white"
						await this.plugin.saveAllData()
						this.display()
					}else{
						folder_deck.settingEl.style.background = "red"
					}
				})
			)
		folder_deck.settingEl = row_cells[0] as HTMLElement
		folder_deck.infoEl.remove()
		folder_deck.controlEl.className += " anki-center"
	}

	setup_folder_deck(folder: TFolder, row_cells: HTMLCollection) {
		let folder_decks = this.plugin.settings.FOLDER_DECKS
		let folder_deck = new Setting(row_cells[1] as HTMLElement)
			.addText(
				text => text.setValue(folder_decks[folder.path])
				.onChange(async (value) => {
					this.plugin.settings.FOLDER_DECKS[folder.path] = value
					await this.plugin.saveAllData()
					if(value == "") //maybe delete this note
						this.display()
				})
			)
		folder_deck.settingEl = row_cells[1] as HTMLElement
		folder_deck.infoEl.remove()
		folder_deck.controlEl.className += " anki-center"
	}

	setup_folder_tag(folder: TFolder, row_cells: HTMLCollection) {
		let folder_tags = this.plugin.settings.FOLDER_TAGS
		let folder_tag = new Setting(row_cells[2] as HTMLElement)
			.addText(
				text => text.setValue(folder_tags[folder.path])
				.onChange(async (value) => {
					this.plugin.settings.FOLDER_TAGS[folder.path] = value
					await this.plugin.saveAllData()
					if(value == "") // maybe delete this note
						this.display()
				})
			)
		folder_tag.settingEl = row_cells[2] as HTMLElement
		folder_tag.infoEl.remove()
		folder_tag.controlEl.className += " anki-center"
	}

	async setup_folder_table() {
		let {containerEl} = this;
		const folder_list = this.get_folders()
		containerEl.createEl('h3', {text: 'Folder settings'})
		let folder_table = containerEl.createEl('table', {cls: "anki-settings-table"})
		let head = folder_table.createTHead()
		let header_row = head.insertRow()
		for (let header of ["Folder", "Folder Deck", "Folder Tags"]) {
			let th = document.createElement("th")
			th.appendChild(document.createTextNode(header))
			header_row.appendChild(th)
		}
		let main_body = folder_table.createTBody()

		for (let folder of folder_list) {
			if(		(this.plugin.settings.FOLDER_DECKS[folder.path] === ""	|| !this.plugin.settings.FOLDER_DECKS[folder.path]) 
				&& 	(this.plugin.settings.FOLDER_TAGS[folder.path] === ""	|| !this.plugin.settings.FOLDER_TAGS[folder.path]))
				continue

			folder_table.style.display = 'table'
			let row = main_body.insertRow()

			row.insertCell()
			row.insertCell()
			row.insertCell()

			let row_cells = row.children

			this.setup_folder_field(folder, row_cells)
			this.setup_folder_deck(folder, row_cells)
			this.setup_folder_tag(folder, row_cells)
		}

		new Setting(containerEl)
		.setName("Add new folder settings")
		.addButton(
			button => {
				button.setButtonText("Add").setClass("mod-cta")
				.onClick(async () => {
					for(let folder of folder_list){
						if((this.plugin.settings.FOLDER_DECKS[folder.path] === "" || !this.plugin.settings.FOLDER_DECKS[folder.path]) && (this.plugin.settings.FOLDER_TAGS[folder.path] === ""|| !this.plugin.settings.FOLDER_TAGS[folder.path])){
							this.plugin.settings.FOLDER_DECKS[folder.path] = "Change Me"
							this.plugin.settings.FOLDER_TAGS[folder.path] = "Change Me"
							await this.plugin.saveAllData()
							this.display()
							break
						}
					}
				})
			}
		)
	}

	setup_buttons() {
		let {containerEl} = this
		let action_buttons = containerEl.createEl('h3', {text: 'Actions'})
		new Setting(action_buttons)
			.setName("Regenerate Note Type Table")
			.setDesc("Connect to Anki to regenerate the table with new note types, or get rid of deleted note types.")
			.addButton(
				button => {
					button.setButtonText("Regenerate").setClass("mod-cta")
					.onClick(async () => {
						await this.plugin.createAnkiFileds()
						await this.plugin.saveAllData()
						this.display()
						new Notice("Note types updated!")
					})
				}
			)
		new Setting(action_buttons)
			.setName("Clear Media Cache")
			.setDesc(`Clear the cached list of media filenames that have been added to Anki.

			The plugin will skip over adding a media file if it's added a file with the same name before, so clear this if e.g. you've updated the media file with the same name.`)
			.addButton(
				button => {
					button.setButtonText("Clear").setClass("mod-cta")
					.onClick(async () => {
						this.plugin.added_media = []
						await this.plugin.saveAllData()
						new Notice("Media Cache cleared successfully!")
					})
				}
			)
		new Setting(action_buttons)
			.setName("Clear File Hash Cache")
			.setDesc(`Clear the cached dictionary of file hashes that the plugin has scanned before.

			The plugin will skip over a file if the file path and the hash is unaltered.`)
			.addButton(
				button => {
					button.setButtonText("Clear").setClass("mod-cta")
					.onClick(async () => {
						this.plugin.file_hashes = {}
						await this.plugin.saveAllData()
						new Notice("File Hash Cache cleared successfully!")
					})
				}
			)
	}

	setup_ignore_files() {
		let { containerEl } = this;
		let ignored_files_settings = containerEl.createEl('h3', { text: 'Ignored File Settings' })
		this.plugin.settings["IGNORED_FILE_GLOBS"] = this.plugin.settings.hasOwnProperty("IGNORED_FILE_GLOBS") ? this.plugin.settings["IGNORED_FILE_GLOBS"] : DEFAULT_IGNORED_FILE_GLOBS
		const descriptionFragment = document.createDocumentFragment();
		descriptionFragment.createEl("span", { text: "Glob patterns for files to ignore. You can add multiple patterns. One per line. Have a look at the " })
		descriptionFragment.createEl("a", { text: "README.md", href: "https://github.com/Pseudonium/Obsidian_to_Anki?tab=readme-ov-file#features" });
		descriptionFragment.createEl("span", { text: " for more information, examples and further resources." })


		new Setting(ignored_files_settings)
			.setName("Patterns to ignore")
			.setDesc(descriptionFragment)
			.addTextArea(text => {
				text.setValue(this.plugin.settings.IGNORED_FILE_GLOBS.join("\n"))
					.setPlaceholder("Examples: '**/*.excalidraw.md', 'Templates/**'")
					.onChange(async (value) => {
						let ignoreLines = value.split("\n")
						ignoreLines = ignoreLines.filter(e => e.trim() != "") //filter out empty lines and blank lines
						this.plugin.settings.IGNORED_FILE_GLOBS = ignoreLines

						await this.plugin.saveAllData()
					}
					)
				text.inputEl.rows = 10
				text.inputEl.cols = 30
			});
	}

	async display() {
		let {containerEl} = this

		containerEl.empty()
		containerEl.createEl('h2', {text: 'Obsidian_to_Anki settings'})
		containerEl.createEl('a', {text: 'For more information check the wiki', href: "https://github.com/Pseudonium/Obsidian_to_Anki/wiki"})
		await this.setup_note_table()
		this.setup_folder_table()
		this.setup_syntax()
		this.setup_defaults()
		this.setup_buttons()
		this.setup_ignore_files()
	}
}
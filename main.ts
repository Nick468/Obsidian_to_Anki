import { Notice, Plugin, addIcon, TFile, TFolder, TAbstractFile} from 'obsidian'
import * as AnkiConnect from './src/anki'
import { PluginSettings, FileData, storedDataInterface} from './src/interfaces/settings-interface'
import { DEFAULT_IGNORED_FILE_GLOBS, SettingsTab } from './src/settings'
import { ANKI_ICON } from './src/constants'
import { settingToFileData } from './src/setting-to-data'
import { FileManager } from './src/files-manager'

export default class obsidian_to_anki_plugin extends Plugin {

	settings: PluginSettings
	note_types: Array<string> = []
	fields_dict: Record<string, string[]> = {}
	added_media: string[] = []
	file_hashes: Record<string, string> = {}

	createDefaultSettings() {
		this.settings = {
			noteTypes: {},
			FOLDER_DECKS: {},
			FOLDER_TAGS: {},
			Syntax: {
				"Begin Note": "START",
				"End Note": "END",
				"Begin Inline Note": "STARTI",
				"End Inline Note": "ENDI",
				"Target Deck Line": "TARGET DECK",
				"File Tags Line": "FILE TAGS",
				"Delete Note Line": "DELETE",
				"Frozen Fields Line": "FROZEN"
			},
			Defaults: {
				ScanDirectory: "",
				GlobalTag: "Obsidian_to_Anki",
				GlobalDeck: "Default",
				SchedulingInterval: 0,
				MirrorObsidianStructure: false,
				AddFileLink: false,
				AddContext: false,
				IDComments: true,
				AddObsidianTags: false,
				CurlyCloze: false,
				HighlightsToCloze: false,
				AnkiCustomCloze: false,
			},
			IGNORED_FILE_GLOBS: DEFAULT_IGNORED_FILE_GLOBS,
		}
	}

	async createAnkiFileds(): Promise<boolean> {
		try {
			this.note_types = await AnkiConnect.invoke('modelNames') as string[]

			for (let note_type of this.note_types) {
				// adding note type if it doesn't yet exist
				if (!this.settings.noteTypes.hasOwnProperty(note_type))
					this.settings.noteTypes[note_type] = { custom_regexp: "", file_link_field: "", context_field: "", extra_field: "" }

				// create fields_dict; old version can be overwritten
				this.fields_dict[note_type] = await AnkiConnect.invoke('modelFieldNames', { modelName: note_type }) as string[]
			}

			// Removing old note types
			for (let note_type of Object.keys(this.settings.noteTypes)) {
				if (!this.note_types.includes(note_type)) {
					delete this.settings.noteTypes[note_type]
				}
			}

			return true
		}
		catch (e) {
			new Notice("Couldn't connect to Anki! Check console for error message.")
			return false
		}

	}

	async loadStoredData() {
		const storedData: storedDataInterface = await this.loadData()
		if (!storedData) {
			new Notice("Need to connect to Anki generate default settings...")
			this.createDefaultSettings()
			if (await this.createAnkiFileds()) {
				await this.saveAllData()
				new Notice("Default settings successfully generated!")
			}
		} else {
			this.settings = storedData.settings
			this.note_types = Object.keys(this.settings.noteTypes)
			this.fields_dict = storedData.fields_dict
			this.added_media = storedData.added_media
			this.file_hashes = storedData.file_hashes
		}
	}

	async saveAllData(): Promise<void> {
		const dataToStore: storedDataInterface = {
			settings: this.settings, 
			added_media: this.added_media, 
			file_hashes: this.file_hashes, 
			fields_dict: this.fields_dict
		}
		await this.saveData(dataToStore)
	}

	async deleteIDs(file:TFile){
		let content = await this.app.vault.read(file)
		const REPL_ID_REGEXP: RegExp = /(<!--ID:\s?\d{13}.*-->)/gm
		content = content.replace(REPL_ID_REGEXP, "")
		this.app.vault.modify(file, content)
	}

	async scanVault(scanDirOverwrite?:TAbstractFile) {
		// test connection to anki
		// TODO: Parse requestPermission result
		new Notice('Scanning vault, check console for details...');
		console.info("Checking connection to Anki...")
		try {
			let result = await AnkiConnect.invoke('requestPermission') as any
			if(result.permission !== "granted")
				throw new Error("Permission not granted")
		}
		catch(e) {
			console.log(e);
			new Notice("Error, couldn't connect to Anki! Check console for error message.");
			return;
		}
		new Notice("Successfully connected to Anki! This could take a few minutes - please don't close Anki until the plugin is finished");
		const fileData: FileData = await settingToFileData(this.settings, this.fields_dict);
		//const fileManagerData: fileManagerData = await settingstoFileManagerData(this.settings)
		

		let scanDir;
		if(scanDirOverwrite == null){
			// scan of the Scan Directory (Settings)
			let scanDirStr = this.settings.Defaults["Scan Directory"]
			// no Scan Directory set (scanning the entire vault)
			if(scanDirStr == ""){
				scanDirStr = "/"
			}
			scanDir = this.app.vault.getAbstractFileByPath(scanDirStr)
			if(scanDir == null){
				new Notice("Cannot find global Scan Directory");
				return;
			}
		}else{
			// request initiated from file-menu
			scanDir = scanDirOverwrite;
		}
		
		let manager: FileManager;

		if (scanDir !== null) {
			if (scanDir instanceof TFolder) {
				console.info("Using custom scan directory: " + scanDir.path);
			} else {
				console.info("Only scanning file: " + scanDir.name);
			}
			manager = new FileManager(this, fileData, /*fileManagerData,*/ scanDir, this.file_hashes, this.added_media);
		} else {
			//shouldt be empty, but I am leaving this here for possible fuck ups
			throw new Error('scanDir is empty');
		}
		
		await manager.initialiseFiles()
		await manager.requests_1()
		this.added_media = Array.from(manager.added_media_set)
		const hashes = manager.getHashes()
		for (let key in hashes) {
			this.file_hashes[key] = hashes[key]
		}
		new Notice("All done! Saving file hashes and added media now...")
		this.saveAllData()
	}

	async onload() {
		console.log('loading Obsidian_to_Anki...');
		addIcon('anki', ANKI_ICON)

		this.loadStoredData()
		this.addSettingTab(new SettingsTab(this.app, this));

		/*
		// Left-hand ribbon icon for total file scan
		this.addRibbonIcon('anki', 'Obsidian_to_Anki - Scan Vault', async () => {
			await this.scanVault()
		})*/

		this.registerEvent(
			this.app.workspace.on("file-menu", async (menu, file) => {
				menu.addItem((item) => {
					item.setTitle("Anki update")
						.setIcon("anki")
						.onClick(async () => {
							this.scanVault(file);
						});
				});
			})
		);		

		this.addCommand({
			id: "anki-delete-id",
			name: "Delete IDs from active file",
			callback: async() => {
				const noteFile = this.app.workspace.getActiveFile()
				if(!noteFile.name) 
					return;
				await this.deleteIDs(noteFile)
			},
		});

		this.addCommand({
			id: 'anki-scan-vault',
			name: 'Scan Vault (Scan Directory)',
			callback: async () => {
			 	await this.scanVault()
			 }
		})
	}

	async onunload() {
		console.log("Saving settings for Obsidian_to_Anki...")
		this.saveAllData()
		console.log('unloading Obsidian_to_Anki...');
	}
}


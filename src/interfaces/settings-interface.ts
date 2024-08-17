import { AnkiConnectNote } from './note-interface'

export interface storedDataInterface{
	settings: PluginSettings
	added_media: string[],
	file_hashes: Record<string, string>,
	fields_dict: Record<string, string[]>
}

export interface noteTypeSettings{
	custom_regexp: string
	file_link_field: string
	context_field: string
	extra_field: string
}

export interface PluginSettings {
	noteTypes: Record<string, noteTypeSettings>
	FOLDER_DECKS: Record<string, string>,
	FOLDER_TAGS: Record<string, string>,
	Syntax: {
		"Begin Note": string,
		"End Note": string,
		"Begin Inline Note": string,
		"End Inline Note": string,
		"Target Deck Line": string,
		"File Tags Line": string,
		"Delete Note Line": string,
		"Frozen Fields Line": string
	},
	Defaults: {
		ScanDirectory: string,
		GlobalTag: string,
		GlobalDeck: string,
		SchedulingInterval: number,
		MirrorObsidianStructure: boolean,
		AddFileLink: boolean,
		AddContext: boolean,
		IDComments: boolean,
		AddObsidianTags: boolean,
		CurlyCloze: boolean,
		HighlightsToCloze: boolean,
		AnkiCustomCloze: boolean
	},
	IGNORED_FILE_GLOBS:string[]
}

export interface FileData {
	template: AnkiConnectNote
	EXISTING_IDS: number[]

	FROZEN_REGEXP: RegExp
	DECK_REGEXP: RegExp
	TAG_REGEXP: RegExp
	NOTE_REGEXP: RegExp
	INLINE_REGEXP: RegExp
	EMPTY_REGEXP: RegExp
}
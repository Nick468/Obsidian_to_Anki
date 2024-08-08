import { PluginSettings, FileData, fileManagerData } from './interfaces/settings-interface'
import { App } from 'obsidian'
import * as AnkiConnect from './anki'
import { ID_REGEXP_STR } from './note'
import { escapeRegex } from './constants'

export async function settingToFileData(app: App, settings: PluginSettings, fields_dict: Record<string, string[]>): Promise<FileData> {
    let result: FileData = <FileData>{}

    //Some processing required

    //TOTO: Add option
    result.mirrorObsidianFolders = true

    result.folder_decks = settings.FOLDER_DECKS
    result.defaultDeck = settings.Defaults.Deck


    result.vault_name = app.vault.getName()
    result.fields_dict = fields_dict
    result.custom_regexps = settings.CUSTOM_REGEXPS
    result.file_link_fields = settings.FILE_LINK_FIELDS
    result.context_fields = settings.CONTEXT_FIELDS
    result.extra_fields = {"ObsidianNote": "Extra"}
    result.template = {
        deckName: settings.Defaults.Deck,
        modelName: "",
        fields: {},
        options: {
            allowDuplicate: true,
            duplicateScope: "deck"
        },
        tags: [settings.Defaults.Tag]
    }
    result.EXISTING_IDS = await AnkiConnect.invoke('findNotes', {query: ""}) as number[]

    //RegExp section
    result.FROZEN_REGEXP = new RegExp(escapeRegex(settings.Syntax["Frozen Fields Line"]) + String.raw` - (.*?):\n((?:[^\n][\n]?)+)`, "g")
    result.DECK_REGEXP = new RegExp(String.raw`^` + escapeRegex(settings.Syntax["Target Deck Line"]) + String.raw`(?:\n|: )(.*)`, "m")
    result.TAG_REGEXP = new RegExp(String.raw`^` + escapeRegex(settings.Syntax["File Tags Line"]) + String.raw`(?:\n|: )(.*)`, "m")
    result.NOTE_REGEXP = new RegExp(String.raw`^` + escapeRegex(settings.Syntax["Begin Note"]) + String.raw`\n([\s\S]*?\n)` + escapeRegex(settings.Syntax["End Note"]), "gm")
    result.INLINE_REGEXP = new RegExp(escapeRegex(settings.Syntax["Begin Inline Note"]) + String.raw`(.*?)` + escapeRegex(settings.Syntax["End Inline Note"]), "g")
    result.EMPTY_REGEXP = new RegExp(escapeRegex(settings.Syntax["Delete Note Line"]) + ID_REGEXP_STR, "g")

    //Just a simple transfer
    result.curly_cloze = settings.Defaults.CurlyCloze
    result.highlights_to_cloze = settings.Defaults["CurlyCloze - Highlights to Clozes"]
    result.custom_cloze = settings.Defaults["Anki custom cloze"]
    result.add_file_link = settings.Defaults["Add File Link"]
    result.comment = settings.Defaults["ID Comments"]
    result.add_context = settings.Defaults["Add Context"]
    result.add_obs_tags = settings.Defaults["Add Obsidian Tags"]

    return result
}

export async function settingstoFileManagerData(settings: PluginSettings){
    let result: fileManagerData = <fileManagerData>{}

    result.ignored_file_globs = settings.IGNORED_FILE_GLOBS ?? [];
    result.folder_tags = settings.FOLDER_TAGS

    return result
}
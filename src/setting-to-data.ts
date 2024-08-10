import { PluginSettings, FileData } from './interfaces/settings-interface'

import * as AnkiConnect from './anki'
import { ID_REGEXP_STR } from './note'
import { escapeRegex } from './constants'

export async function settingToFileData(settings: PluginSettings, fields_dict: Record<string, string[]>): Promise<FileData> {
    let result: FileData = <FileData>{}

    result.template = {
        deckName: settings.Defaults.GlobalDeck,
        modelName: "",
        fields: {},
        options: {
            allowDuplicate: true,
            duplicateScope: "deck"
        },
        tags: [settings.Defaults.GlobalTag]
    }
    result.EXISTING_IDS = await AnkiConnect.invoke('findNotes', {query: ""}) as number[]

    //RegExp section
    result.FROZEN_REGEXP = new RegExp(escapeRegex(settings.Syntax["Frozen Fields Line"]) + String.raw` - (.*?):\n((?:[^\n][\n]?)+)`, "g")
    result.DECK_REGEXP = new RegExp(String.raw`^` + escapeRegex(settings.Syntax["Target Deck Line"]) + String.raw`(?:\n|: )(.*)`, "m")
    result.TAG_REGEXP = new RegExp(String.raw`^` + escapeRegex(settings.Syntax["File Tags Line"]) + String.raw`(?:\n|: )(.*)`, "m")
    result.NOTE_REGEXP = new RegExp(String.raw`^` + escapeRegex(settings.Syntax["Begin Note"]) + String.raw`\n([\s\S]*?\n)` + escapeRegex(settings.Syntax["End Note"]), "gm")
    result.INLINE_REGEXP = new RegExp(escapeRegex(settings.Syntax["Begin Inline Note"]) + String.raw`(.*?)` + escapeRegex(settings.Syntax["End Inline Note"]), "g")
    result.EMPTY_REGEXP = new RegExp(escapeRegex(settings.Syntax["Delete Note Line"]) + ID_REGEXP_STR, "g")

    return result
}

/*Performing plugin operations on markdown file contents*/

import { FROZEN_FIELDS_DICT } from './interfaces/field-interface'
import { AnkiConnectNoteAndID, RegexMatch } from './interfaces/note-interface'
import { FileData } from './interfaces/settings-interface'
import { Note, InlineNote, RegexNote, TAG_REGEXP_STR } from './note'
import { Md5 } from 'ts-md5/dist/md5';
import * as AnkiConnect from './anki'
import * as c from './constants'
import { FormatConverter } from './format'
import { CachedMetadata, HeadingCache, TFile } from 'obsidian'
import obsidian_to_anki_plugin from '../main';

function string_insert(text: string, position_inserts: Array<[number, string]>): string {
    /*Insert strings in position_inserts into text, at indices.

    position_inserts will look like:
    [(0, "hi"), (3, "hello"), (5, "beep")]*/
    let offset = 0
    let sorted_inserts: Array<[number, string]> = position_inserts.sort((a, b): number => a[0] - b[0])
    for (let insertion of sorted_inserts) {
        let position = insertion[0]
        let insert_str = insertion[1]
        text = text.slice(0, position + offset) + insert_str + text.slice(position + offset)
        offset += insert_str.length
    }
    return text
}

function spans(pattern: RegExp, text: string): Array<[number, number]> {
    /*Return a list of span-tuples for matches of pattern in text.*/
    let output: Array<[number, number]> = []
    let matches = text.matchAll(pattern)
    for (let match of matches) {
        output.push(
            [match.index, match.index + match[0].length]
        )
    }
    return output
}

function contained_in(span: [number, number], spans: Array<[number, number]>): boolean {
    /*Return whether span is contained in spans (+- 1 leeway)*/
    return spans.some(
        (element) => span[0] >= element[0] - 1 && span[1] <= element[1] + 1
    )
}

function* findignore(pattern: RegExp, text: string, ignore_spans: Array<[number, number]>): IterableIterator<RegExpMatchArray> {
    let matches = text.matchAll(pattern)
    for (let match of matches) {
        if (!(contained_in([match.index, match.index + match[0].length], ignore_spans))) {
            yield match
        }
    }
}

export class AllFile {
    plugin: obsidian_to_anki_plugin

    obsidian_file: TFile
    
    file_content: string
    original_file_content: string

    path: string
    fullPath: string

    url: string
    data: FileData
    file_cache: CachedMetadata

    frozen_fields_dict: FROZEN_FIELDS_DICT

    regular_notes_to_add: AnkiConnectNoteAndID[] = []
    inline_notes_to_add: AnkiConnectNoteAndID[] = []
    regex_notes_to_add: AnkiConnectNoteAndID[] = []
    all_notes_to_add: AnkiConnectNoteAndID[] = []
    
    notes_to_edit: AnkiConnectNoteAndID[] = []
    notes_to_delete: number[] = []
    
    formatter: FormatConverter

    ignore_spans: [number, number][]
    

    constructor(file: TFile, file_content: string, file_cache: CachedMetadata, data: FileData, plugin: obsidian_to_anki_plugin) {    
        this.plugin = plugin
        this.obsidian_file = file
        this.file_cache = file_cache
        this.data = data
        this.file_content = file_content
        this.original_file_content = file_content
        
        this.path = file.path

        this.url = this.plugin.settings.Defaults.AddFileLink ? "obsidian://open?vault=" + encodeURIComponent(this.plugin.app.vault.getName()) + String.raw`&file=` + encodeURIComponent(file.path) : ""

        this.setup_frozen_fields_dict()
        this.add_spans_to_ignore()

        this.setup_fileDefault_target_deck()
        this.setup_fileDefault_tags()

        
        this.formatter = new FormatConverter(file_cache, this.path, plugin)
        
    }

    id_to_str(identifier: number, inline: boolean = false, comment: boolean = false): string {
        let result = "ID:" + identifier.toString()
        if (comment && !this.plugin.settings.Defaults.UseObsidianComment)
            result = "<!--" + result + "-->"
        else if(comment && this.plugin.settings.Defaults.UseObsidianComment)
            result = "%%" + result + "%%"
    
        if (inline) {
            result += " "
        } else {
            result += "\n"
        }
        return result
    }

    setup_frozen_fields_dict() {
        let frozen_fields_dict: FROZEN_FIELDS_DICT = {}
        for (let note_type in this.plugin.fields_dict) {
            let fields: string[] = this.plugin.fields_dict[note_type]
            let temp_dict: Record<string, string> = {}
            for (let field of fields) {
                temp_dict[field] = ""
            }
            frozen_fields_dict[note_type] = temp_dict
        }
        for (let match of this.file_content.matchAll(this.data.FROZEN_REGEXP)) {
            const [note_type, fields]: [string, string] = [match[1], match[2]]
            const virtual_note = note_type + "\n" + fields
            /*const parsed_fields: Record<string, string> = new Note(
                virtual_note,
                this.data.fields_dict,
                this.data.curly_cloze,
                this.data.highlights_to_cloze,
                this.data.custom_cloze,
                this.formatter
            ).getFields()
            frozen_fields_dict[note_type] = parsed_fields*/
        }
        this.frozen_fields_dict = frozen_fields_dict
    }

    setup_fileDefault_target_deck() {
        // this.data.template.deckName contains the global target deck set in the settings
        
        // overwrite default deck by appending the obsidian file path
        if (this.plugin.settings.Defaults.MirrorObsidianStructure) {
            let pathWithoutExtension: string = this.path.slice(0, -3)
            let obsidianFolderDeck: string  = pathWithoutExtension.replaceAll("/", "::")
            
            if(this.plugin.settings.Defaults.GlobalDeck.length == 0)
                this.data.template.deckName = obsidianFolderDeck
            else
                this.data.template.deckName = this.plugin.settings.Defaults.GlobalDeck + "::" + obsidianFolderDeck
        }

        // overwrtie default deck by settings -> folder settings
        let path: string = this.path
        do{
            if(this.plugin.settings.FOLDER_DECKS[path]){
                if(this.plugin.settings.FOLDER_DECKS[path].length > 0){
                    this.data.template.deckName = this.plugin.settings.FOLDER_DECKS[path]
                    break
                }
            }
            let sections = path.split("/");
            sections.pop();
            path = sections.join("/");
        }while(path.length > 0)
    
        // in-file overwrite by TARGET DECK keyword
        let match = this.file_content.match(this.data.DECK_REGEXP)
        if(match)
            this.data.template.deckName = match[1] //TODO: Check if this works
        
    }

    setup_fileDefault_tags() {
        const result = this.file_content.match(this.data.TAG_REGEXP)
        if(result)
            this.data.template.tags.push(...result[1].split(" ")) 

        let path: string = this.path
        do{
            if(this.plugin.settings.FOLDER_TAGS[path])
                this.data.template.tags.push(this.plugin.settings.FOLDER_TAGS[path])
            
            let sections = path.split("/");
            sections.pop();
            path = sections.join("/");
        }while(path.length > 0)
    }

    scanDeletions() {
        for (let match of this.file_content.matchAll(this.data.EMPTY_REGEXP)) {
            this.notes_to_delete.push(parseInt(match[1]))
        }
    }

    getContextAtIndex(position: number): string {
        let result: string = this.path
        let currentContext: HeadingCache[] = []
        if (!(this.file_cache.hasOwnProperty('headings'))) {
            return result
        }
        for (let currentHeading of this.file_cache.headings) {
            if (position < currentHeading.position.start.offset) {
                //We've gone past position now with headings, so let's return!
                break
            }
            let insert_index: number = 0
            for (let contextHeading of currentContext) {
                if (currentHeading.level > contextHeading.level) {
                    insert_index += 1
                    continue
                }
                break
            }
            currentContext = currentContext.slice(0, insert_index)
            currentContext.push(currentHeading)
        }
        let heading_strs: string[] = []
        for (let contextHeading of currentContext) {
            heading_strs.push(contextHeading.heading)
        }
        let result_arr: string[] = [result]
        result_arr.push(...heading_strs)
        return result_arr.join(" > ")
    }

    removeEmpties() {
        //removes notes with the DELETE keyword
        this.file_content = this.file_content.replaceAll(this.data.EMPTY_REGEXP, "")
    }

    add_spans_to_ignore() {
        this.ignore_spans = []
        this.ignore_spans.push(...spans(this.data.FROZEN_REGEXP, this.file_content))
        const deck_result = this.file_content.match(this.data.DECK_REGEXP)
        if (deck_result) {
            this.ignore_spans.push([deck_result.index, deck_result.index + deck_result[0].length])
        }
        const tag_result = this.file_content.match(this.data.TAG_REGEXP)
        if (tag_result) {
            this.ignore_spans.push([tag_result.index, tag_result.index + tag_result[0].length])
        }
        this.ignore_spans.push(...spans(this.data.NOTE_REGEXP, this.file_content))
        this.ignore_spans.push(...spans(this.data.INLINE_REGEXP, this.file_content))
        this.ignore_spans.push(...spans(c.OBS_INLINE_MATH_REGEXP, this.file_content))
        this.ignore_spans.push(...spans(c.OBS_DISPLAY_MATH_REGEXP, this.file_content))
    }

    async scanNotes() {
        for (let note_match of this.file_content.matchAll(this.data.NOTE_REGEXP)) {
            let [note, position]: [string, number] = [note_match[1], note_match.index + note_match[0].indexOf(note_match[1]) + note_match[1].length]
            // That second thing essentially gets the index of the end of the first capture group.
            let parsed = await new Note(
                this.plugin.fields_dict,
                this.frozen_fields_dict,
                this.formatter,
                this.data,
                this.plugin
            ).parse(
                note,
                this.url,
                this.plugin.settings.Defaults.AddContext ? this.getContextAtIndex(note_match.index) : "",
                this.path
            )

            if (!parsed)
                continue

            if (parsed.identifier == null) {
                parsed.identifierPosition = position
                this.regular_notes_to_add.push(parsed)
            } else if (!this.data.EXISTING_IDS.includes(parsed.identifier)) {
                // Need to show an error otherwise
                console.warn("Note with id", parsed.identifier, " in file ", this.obsidian_file.path, " does not exist in Anki!")
            } else {
                this.notes_to_edit.push(parsed)
            }
        }
    }

    async scanInlineNotes() {
        for (let note_match of this.file_content.matchAll(this.data.INLINE_REGEXP)) {
            let [note, position]: [string, number] = [note_match[1], note_match.index + note_match[0].indexOf(note_match[1]) + note_match[1].length]
            // That second thing essentially gets the index of the end of the first capture group.
            let parsed = await new InlineNote(
                this.plugin.fields_dict,
                this.frozen_fields_dict,
                this.formatter,
                this.data,
                this.plugin
            ).parse(
                note,
                this.url,
                this.plugin.settings.Defaults.AddContext ? this.getContextAtIndex(note_match.index) : "",
                this.path
            )

            if(!parsed)
                continue

            if (parsed.identifier == null) {
                parsed.identifierPosition = position
                this.inline_notes_to_add.push(parsed)
            } else if (!this.data.EXISTING_IDS.includes(parsed.identifier)) {
                // Need to show an error
                console.warn("Note with id", parsed.identifier, " in file ", this.obsidian_file.path, " does not exist in Anki!")
            } else {
                this.notes_to_edit.push(parsed)
            }
        }
    }

    async search(note_type: string, regexp_str: string) {
        //Search the file for regex matches
        //ignoring matches inside ignore_spans,
        //and adding any matches to ignore_spans.
        for (let search_id of [true, false]) {
            for (let search_tags of [true, false]) {
                let id_str = search_id ? String.raw`\n*` + c.ID_REGEXP_STR : ""
                let tag_str = search_tags ? TAG_REGEXP_STR : ""
                let regexp: RegExp = new RegExp(regexp_str + tag_str + id_str, 'gm')
                for (let match of findignore(regexp, this.file_content, this.ignore_spans)) {
                    this.ignore_spans.push([match.index, match.index + match[0].length])
                    let regexMatch: RegexMatch = this.formatMatchDict(match, search_id, search_tags)
                    const parsed: AnkiConnectNoteAndID = await new RegexNote(
                        this.frozen_fields_dict,
                        this.formatter,
                        this.data,
                        note_type,
                        this.plugin
                    ).parse(
                        regexMatch,
                        this.url,
                        this.plugin.settings.Defaults.AddContext ? this.getContextAtIndex(match.index) : "",
                        this.path
                    )

                    if(!parsed){
                        this.ignore_spans.pop()
                        continue
                    }

                    if (search_id) {
                        if (!(this.data.EXISTING_IDS.includes(parsed.identifier))) {
                            console.warn("Note with id", parsed.identifier, " in file ", this.obsidian_file.path, " does not exist in Anki!")
                        } else {
                            this.notes_to_edit.push(parsed)
                        }
                    } else {
                        parsed.identifierPosition = match.index + match[0].length
                        this.regex_notes_to_add.push(parsed)
                    }
                }
            }
        }
    }

    async scanFile() {
        await this.scanNotes()
        await this.scanInlineNotes()
        for (let note_type in this.plugin.settings.noteTypes) {
            const regexp_str: string = this.plugin.settings.noteTypes[note_type].custom_regexp
            if (regexp_str) {
                await this.search(note_type, regexp_str)
            }
        }
        this.all_notes_to_add = this.regular_notes_to_add.concat(this.inline_notes_to_add).concat(this.regex_notes_to_add)
        this.scanDeletions()
        //look if anything was found in the file; return false if not
        return (this.notes_to_delete.length + this.notes_to_edit.length + this.all_notes_to_add.length) == 0 ? false : true
    }

    writeIDs() {
        let inserts: [number, string][] = []
        
        for (let note of this.regular_notes_to_add){
            inserts.push([note.identifierPosition, this.id_to_str(note.identifier, false, this.plugin.settings.Defaults.IDComments)])
        }
        
        for(let note of this.inline_notes_to_add){
            inserts.push([note.identifierPosition, this.id_to_str(note.identifier, true, this.plugin.settings.Defaults.IDComments)])
        }
                
        for (let note of this.regex_notes_to_add){
            inserts.push([note.identifierPosition, "\n" + "\n" + this.id_to_str(note.identifier, false, this.plugin.settings.Defaults.IDComments)])
        }

        this.file_content = string_insert(this.file_content, inserts)
    }

    fix_newline_ids() {
        // ensures that exactly 2 newlines are present before the id comment
        
        // 1. check that there are not more than two new lines
        const additionalNewline: RegExp = new RegExp(String.raw`(?:\n)+(\n{2}` + c.ID_REGEXP_STR + String.raw`)`, "g")
        this.file_content = this.file_content.replaceAll(additionalNewline, "$1")

        // 2. check that there are not less than two new lines
        // negative lookahead: tests for End Note in the next line to only move the id comments of regex-notes (not regular notes)
        const missingNewline: RegExp = new RegExp(String.raw`(?<=.)(\n` + c.ID_REGEXP_STR + String.raw`)(?!\n` + c.escapeRegex(this.plugin.settings.Syntax['End Note']) + String.raw`)`, "g")
        this.file_content = this.file_content.replace(missingNewline, "\n$1")
    }

    formatMatchDict(matchArr: RegExpMatchArray, search_id: boolean, search_tags: boolean): RegexMatch {
        let regexMatch: RegexMatch = {allMatch: matchArr[0], title : matchArr[1], text: matchArr[2]}
        
        let iterator = 3

        if (search_tags) {
            regexMatch.tags = matchArr[iterator]
            iterator++
        }

        if (search_id) {
            regexMatch.id = matchArr[iterator]
            iterator++
            regexMatch.link = matchArr[iterator]
            iterator++
            regexMatch.idTags = matchArr[iterator]
        }

        return regexMatch
    }





    createNewDecks(): AnkiConnect.AnkiConnectRequest {
        if(this.all_notes_to_add.length == 0)
            return null
        
        let actions: AnkiConnect.AnkiConnectRequest[] = []
        for (let note of this.all_notes_to_add) {
            actions.push(AnkiConnect.createDeck(note.note.deckName))
        }
        return AnkiConnect.multi(actions)
    }

    getAddNotes(): AnkiConnect.AnkiConnectRequest {
        if(this.all_notes_to_add.length == 0)
            return null
        
        let actions: AnkiConnect.AnkiConnectRequest[] = []
        for (let note of this.all_notes_to_add) {
            actions.push(AnkiConnect.addNote(note.note))
        }
        return AnkiConnect.multi(actions)
    }

    getDeleteNotes(): AnkiConnect.AnkiConnectRequest {
        if(this.notes_to_delete.length == 0)
            return null

        return AnkiConnect.deleteNotes(this.notes_to_delete)
    }

    getUpdateNotes(): AnkiConnect.AnkiConnectRequest {
        if(this.notes_to_edit.length == 0)
            return null

        let actions: AnkiConnect.AnkiConnectRequest[] = []
        for (let parsed of this.notes_to_edit) {
            actions.push(
                AnkiConnect.updateNote(
                    parsed.identifier, parsed.note.fields, parsed.note.tags
                )
            )
        }
        return AnkiConnect.multi(actions)
    }

    getChangeDecks(): AnkiConnect.AnkiConnectRequest {
        if(this.notes_to_edit.length == 0)
            return null

        let requests: AnkiConnect.AnkiConnectRequest[] = []
        for (const note of this.notes_to_edit) {
            requests.push(AnkiConnect.changeDeck([note.identifier], note.note.deckName))
        }
        return AnkiConnect.multi(requests)
    }

    getHash(): string {
        return Md5.hashStr(this.file_content) as string
    }
}

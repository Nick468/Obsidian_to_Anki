/*Manages parsing notes into a dictionary formatted for AnkiConnect.

Input must be the note text.
Does NOT deal with finding the note in the file.*/

import { FormatConverter } from './format'
import { AnkiConnectNote, AnkiConnectNoteAndID, RegexMatch } from './interfaces/note-interface'
import { FIELDS_DICT, FROZEN_FIELDS_DICT } from './interfaces/field-interface'
import { FileData } from './interfaces/settings-interface'
import obsidian_to_anki_plugin from '../main'
import { ID_REGEXP_STR } from './constants'


const TAG_PREFIX:string = "Tags: "
const ID_Tags_REGEXP: RegExp = /(?<=#)[\w\-\/]+/g
export const TAG_SEP:string = " "
export const TAG_REGEXP_STR: string = String.raw`(Tags: .*)`

const ANKI_CLOZE_REGEXP: RegExp = /{{c\d+::[\s\S]+?}}/

function has_clozes(text: string): boolean {
	/*Checks whether text actually has cloze deletions.*/
	return ANKI_CLOZE_REGEXP.test(text)
}

function note_has_clozes(note: AnkiConnectNote): boolean {
	/*Checks whether a note has cloze deletions in any of its fields.*/
	for (let i in note.fields) {
		if (has_clozes(note.fields[i])) {
			return true
		}
	}
	return false
}

abstract class AbstractNote {
    text: string
    split_text: string[]
    field_names: string[]
    current_field: string
    
    plugin: obsidian_to_anki_plugin    
    fields_dict: FIELDS_DICT
    frozen_fields_dict: FROZEN_FIELDS_DICT
    data: FileData
    formatter: FormatConverter

    constructor(fields_dict: FIELDS_DICT, frozen_fields_dict: FROZEN_FIELDS_DICT, formatter: FormatConverter, data: FileData, plugin:obsidian_to_anki_plugin) {
        this.fields_dict = fields_dict
        this.frozen_fields_dict = frozen_fields_dict
        this.data = data
        this.formatter = formatter
        this.formatter.resetFormatter()
        this.plugin = plugin
    }

    abstract getSplitText(): string[]

    abstract getIdentifierAndDeckOverwrite(): [number, string, string[]]

    abstract getTags(): string[]

    abstract getNoteType(): string

    abstract getFields(): Promise<Record<string, string>>

    async parse(note_text: string, url:string, context:string, filePath: string): Promise<AnkiConnectNoteAndID> {
        this.text = note_text.trim()
        this.split_text = this.getSplitText();
        
        let note_type:string = this.getNoteType()
		if (!(this.fields_dict.hasOwnProperty(note_type))) {
			throw new Error("Did not recognise note type " + note_type + " in file " + filePath)
		}

        this.field_names = this.fields_dict[note_type]
        this.current_field = this.field_names[0]

        let newNote = JSON.parse(JSON.stringify(this.data.template))
		newNote.modelName = note_type

        let [identifier, deckOverwrite, idTags]: [number, string, string[]] = this.getIdentifierAndDeckOverwrite()
        newNote.deckName = deckOverwrite ? deckOverwrite : this.data.template.deckName
                
        newNote.fields = await this.getFields()

        // add url
        if (url.length > 0) {
            this.formatter.format_note_with_url(newNote, url, this.plugin.settings.noteTypes[note_type].file_link_field)
        }
        
        // frozen_fields ???
        if (Object.keys(this.frozen_fields_dict).length) {
            this.formatter.format_note_with_frozen_fields(newNote, this.frozen_fields_dict)
        }
		
        // add context field
        if (context.length > 0) {
			const context_field = this.plugin.settings.noteTypes[note_type].context_field
			newNote.fields[context_field] += context
		}
		
        // add tags
        let tags:string[] = this.getTags()
        tags.push(...this.formatter.tags)
        if(idTags)
            tags.push(...idTags)
        newNote.tags.push(...tags)

        return {note: newNote, identifier: identifier}
    }
}


export class Note extends AbstractNote {

    getSplitText(): string[] {
        return this.text.split("\n")
    }

    getIdentifierAndDeckOverwrite(): [number, string, string[]] {
        const match = this.split_text[this.split_text.length-1].match(new RegExp(String.raw`\n*` + ID_REGEXP_STR))
        if(match == null)    
            return [null, null, null]

        this.split_text.pop()
        
        let tags = null
        if(match[3])
            tags = match[3].match(ID_Tags_REGEXP)

        return [parseInt(match[1]), 
                new linkToDeckResolver().linkToDeckResolver(match[2], this.plugin), 
                tags]
    }

    getTags(): string[] {
        if (this.split_text[this.split_text.length-1].startsWith(TAG_PREFIX)) {
            return this.split_text.pop().slice(TAG_PREFIX.length).split(TAG_SEP)
        } else {
            return []
        }
    }

    getNoteType(): string {
        return this.split_text[0]
    }

    fieldFromLine(line: string): [string, string] {
        /*From a given line, determine the next field to add text into.

        Then, return the stripped line, and the field.*/
        for (let field of this.field_names) {
            if (line.startsWith(field + ":")) {
                return [line.slice((field + ":").length), field]
            }
        }
        return [line,this.current_field]
    }

    async getFields(): Promise<Record<string, string>> {
        let fields: Record<string, string> = {}
        for (let field of this.field_names) {
            fields[field] = ""
        }
        for (let line of this.split_text.slice(1)) {
            [line, this.current_field] = this.fieldFromLine(line)
            fields[this.current_field] += line + "\n"
        }
        for (let key in fields) {
            fields[key] = (await this.formatter.format(fields[key].trim())).trim()
        }
        return fields
    }

}

export class InlineNote extends AbstractNote {

    static TAG_REGEXP: RegExp = /Tags: (.*)/;
    static TYPE_REGEXP: RegExp = /\[(.*?)\]/;

    getSplitText(): string[] {
        return this.text.split(" ")
    }

    getIdentifierAndDeckOverwrite(): [number, string, string[]] {
        const match = this.text.match(new RegExp(String.raw`\n*` + ID_REGEXP_STR))
        if(!match)
            return [null, null, null]

        let tags = null
        if(match[3])
            tags = match[3].match(ID_Tags_REGEXP)

        return [parseInt(match[1]), 
                new linkToDeckResolver().linkToDeckResolver(match[2], this.plugin),
                tags]
    }

    getTags(): string[] {
        const result = this.text.match(InlineNote.TAG_REGEXP)
        if (result) {
            this.text = this.text.slice(0, result.index).trim()
            return result[1].split(TAG_SEP)
        } else {
            return []
        }
    }

    getNoteType(): string {
        const result = this.text.match(InlineNote.TYPE_REGEXP)
        this.text = this.text.slice(result.index + result[0].length)
        return result[1]
    }

    async getFields(): Promise <Record<string, string>> {
        let fields: Record<string, string> = {}
        for (let field of this.field_names) {
            fields[field] = ""
        }
        for (let word of this.text.split(" ")) {
            for (let field of this.field_names) {
                if (word === field + ":") {
                    this.current_field = field
                    word = ""
                }
            }
            fields[this.current_field] += word + " "
        }
        for (let key in fields) {
            fields[key] = (await this.formatter.format(fields[key].trim())).trim()
        }
        return fields
    }


}

export class RegexNote {
    plugin: obsidian_to_anki_plugin

    field_names: string[]
	note_type: string
	groups: Array<string>	

    private frozen_fields_dict: FROZEN_FIELDS_DICT
    protected data: FileData
    protected formatter: FormatConverter


    constructor(frozen_fields_dict: FROZEN_FIELDS_DICT, formatter: FormatConverter, data: FileData, note_type: string, plugin: obsidian_to_anki_plugin) {
        this.field_names = plugin.fields_dict[note_type]
        this.frozen_fields_dict = frozen_fields_dict
        this.data = data
        this.formatter = formatter
        this.formatter.resetFormatter()
        this.note_type = note_type
        this.plugin = plugin
    }

	async getFields(match: RegexMatch): Promise<Record<string, string>> {
		let fields: Record<string, string> = {}
        for (let field of this.field_names) {           
            if(field === this.plugin.settings.noteTypes[this.note_type].extra_field)
                continue
            
            fields[field] = ""
        }

        fields[this.field_names[0]] = match["title"]
        fields[this.field_names[1]] = match["text"]
		
        for (let key in fields) {
            if(!fields[key])
                continue
            fields[key] = await this.formatter.format(fields[key].trim())
        }
        return fields
	}

	async parse(match: RegexMatch, url: string = "", context: string, filePath: string): Promise<AnkiConnectNoteAndID> {
        let newNote = JSON.parse(JSON.stringify(this.data.template))
        
        newNote.modelName = this.note_type
        let identifier: number|null = match.id ? parseInt(match.id) : null
		let tags: string[] = match.tags ? match.tags.slice(TAG_PREFIX.length).split(TAG_SEP) : []

        if(match.link){
            let linkToDeck: linkToDeckResolver = new linkToDeckResolver()
            newNote.deckName = linkToDeck.linkToDeckResolver(match.link, this.plugin)
            }
        else
            newNote.deckName = this.data.template.deckName
		  
		newNote.fields = await this.getFields(match)
		if (url) {
            this.formatter.format_note_with_url(newNote, url, this.plugin.settings.noteTypes[this.note_type].file_link_field, match.title)
        }
        if (Object.keys(this.frozen_fields_dict).length) {
            this.formatter.format_note_with_frozen_fields(newNote, this.frozen_fields_dict)
        }
		if (context) {
            const context_field = this.plugin.settings.noteTypes[this.note_type].context_field
			newNote.fields[context_field] += context
		}
		if (this.note_type.includes("Cloze") && !(note_has_clozes(newNote))) {
            console.warn("Close error occured in file " + filePath)
            return null // An error code that says "don't add this note!"
		}

        tags.push(...this.formatter.tags)
        if(match.idTags){
            let idTagsArr = match.idTags.match(ID_Tags_REGEXP)
            if(idTagsArr)
                tags.push(...idTagsArr)
        }
		newNote.tags.push(...tags)
		return {note: newNote, identifier: identifier}
	}
}

class linkToDeckResolver{
    constructor() {}

    linkToDeckResolver(link: string, plugin:obsidian_to_anki_plugin): string {
        if(!link)
            return

        let tempFile = plugin.app.metadataCache.getFirstLinkpathDest(link, "")
        if(!tempFile)
            return

        let deck = tempFile.path.replaceAll("/", "::")
        const index = deck.lastIndexOf('::');
        if (index != -1) {
            deck = deck.substring(0, index);
        }
        if(plugin.settings.Defaults.GlobalDeck.length == 0)
            return deck

        deck = plugin.settings.Defaults.GlobalDeck + "::" + deck
        return deck
    }   
}
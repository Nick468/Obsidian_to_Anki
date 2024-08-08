/*Manages parsing notes into a dictionary formatted for AnkiConnect.

Input must be the note text.
Does NOT deal with finding the note in the file.*/

import { FormatConverter } from './format'
import { AnkiConnectNote, AnkiConnectNoteAndID } from './interfaces/note-interface'
import { FIELDS_DICT, FROZEN_FIELDS_DICT } from './interfaces/field-interface'
import { FileData } from './interfaces/settings-interface'
import { App } from 'obsidian'
import { link } from 'fs'
import multimatch from 'multimatch'

const TAG_PREFIX:string = "Tags: "
export const TAG_SEP:string = " "
export const ID_REGEXP_STR: string = String.raw`\n*<!--ID:\s?(\d{13})\s?(?:\[\[([^|#]*).*\]\]\s*)?-->`
export const TAG_REGEXP_STR: string = String.raw`(Tags: .*)`
const OBS_TAG_REGEXP: RegExp = /(?:\s|>)#(\w+)/g

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
    ID_REGEXP: RegExp = /<!--ID:\s?(\d{13})\s?(?:\[\[([^|#]*).*\]\]\s*)?-->/
    
    app: App    
    fields_dict: FIELDS_DICT
    frozen_fields_dict: FROZEN_FIELDS_DICT
    data: FileData
    formatter: FormatConverter

    constructor(fields_dict: FIELDS_DICT, frozen_fields_dict: FROZEN_FIELDS_DICT, formatter: FormatConverter, data: FileData, app:App) {
        this.fields_dict = fields_dict
        this.frozen_fields_dict = frozen_fields_dict
        this.data = data
        this.formatter = formatter
        this.app = app
    }

    abstract getSplitText(): string[]

    abstract getIdentifierAndDeckOverwrite(): [number | null, string]

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

        let [identifier, deckOverwrite]: [number|null, string] = this.getIdentifierAndDeckOverwrite()
        newNote.deckName = deckOverwrite ? deckOverwrite : this.data.template.deckName
                
        newNote.fields = await this.getFields()

        // add url
        if (url.length > 0) {
            this.formatter.format_note_with_url(newNote, url, this.data.file_link_fields[note_type])
        }
        
        // frozen_fields ???
        if (Object.keys(this.frozen_fields_dict).length) {
            this.formatter.format_note_with_frozen_fields(newNote, this.frozen_fields_dict)
        }
		
        // add context field
        if (context.length > 0) {
			const context_field = this.data.context_fields[note_type]
			newNote.fields[context_field] += context
		}
		
        // add tags
        let tags:string[] = this.getTags()
        if (this.data.add_obs_tags) {
			for (let key in newNote.fields) {
				for (let match of newNote.fields[key].matchAll(OBS_TAG_REGEXP)) {
					tags.push(match[1])
				}
				newNote.fields[key] = newNote.fields[key].replace(OBS_TAG_REGEXP, "")
	        }
		}
        newNote.tags.push(...tags)

        return {note: newNote, identifier: identifier}
    }

}


export class Note extends AbstractNote {

    getSplitText(): string[] {
        return this.text.split("\n")
    }

    getIdentifierAndDeckOverwrite(): [number | null, string] {
        const match = this.split_text[this.split_text.length-1].match(this.ID_REGEXP)
        if(match == null)    
            return [null, null]

        this.split_text.pop()
        let linkToDeck: linkToDeckResolver = new linkToDeckResolver()
        return [parseInt(match[1]), linkToDeck.linkToDeckResolver(match[2], this.app, this.data)]
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

    getIdentifierAndDeckOverwrite(): [number | null, string] {
        const match = this.text.match(this.ID_REGEXP)
        if(!match)
            return [null, null]

        let linkToDeck: linkToDeckResolver = new linkToDeckResolver()
        return [parseInt(match[1]), linkToDeck.linkToDeckResolver(match[2], this.app, this.data)]
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
    app: App

    field_names: string[]



	match: Record<string, string>
	note_type: string
	groups: Array<string>
	//identifier: number | null
	//tags: string[]
	

    private frozen_fields_dict: FROZEN_FIELDS_DICT
    protected data: FileData
    protected formatter: FormatConverter


    constructor(frozen_fields_dict: FROZEN_FIELDS_DICT, formatter: FormatConverter, data: FileData, note_type: string, app: App) {
        this.field_names = data.fields_dict[note_type]
        this.frozen_fields_dict = frozen_fields_dict
        this.data = data
        this.formatter = formatter
        this.note_type = note_type
        this.app = app
    }


	/*constructor(
			match: Record<string, string>,
			note_type: string,
			fields_dict: FIELDS_DICT,
			tags: boolean,
			id: boolean,
			formatter: FormatConverter
        ) {
		this.match = match
		this.note_type = note_type
		this.identifier = id ? parseInt(match["id"]) : null
		this.tags = tags ? match["tags"].slice(TAG_PREFIX.length).split(TAG_SEP) : []
		this.field_names = fields_dict[note_type]
		this.formatter = formatter
	}*/

	async getFields(): Promise<Record<string, string>> {
		let fields: Record<string, string> = {}
        for (let field of this.field_names) {
            //TODO: Stop stupid hardcoding
            
            if(field === this.data.extra_fields[this.note_type])
                continue
            
            fields[field] = ""
        }

        fields[this.field_names[0]] = this.match["title"]
        fields[this.field_names[1]] = this.match["text"]
		
        for (let key in fields) {
            if(!fields[key])
                continue
            fields[key] = await this.formatter.format(fields[key].trim())
            fields[key].trim()
        }
        return fields
	}

	async parse(match: Record<string, string>, url: string = "", context: string, filePath: string): Promise<AnkiConnectNoteAndID> {
		this.match = match
        
        let newNote = JSON.parse(JSON.stringify(this.data.template))
        
        newNote.modelName = this.note_type
        let identifier: number|null = match.id ? parseInt(match.id) : null
		let tags: string[] = match.tags ? match.tags.slice(TAG_PREFIX.length).split(TAG_SEP) : []


        if(match.link){
            let linkToDeck: linkToDeckResolver = new linkToDeckResolver()
            newNote.deckName = linkToDeck.linkToDeckResolver(match.link, this.app, this.data)
            }
        else
            newNote.deckName = this.data.template.deckName
		  
		newNote.fields = await this.getFields()
		const file_link_fields = this.data.file_link_fields
		if (url) {
            this.formatter.format_note_with_url(newNote, url, file_link_fields[this.note_type], match.title)
        }
        if (Object.keys(this.frozen_fields_dict).length) {
            this.formatter.format_note_with_frozen_fields(newNote, this.frozen_fields_dict)
        }
		if (context) {
			const context_field = this.data.context_fields[this.note_type]
			newNote.fields[context_field] += context
		}
		if (this.note_type.includes("Cloze") && !(note_has_clozes(newNote))) {
            console.warn("Close error occured in file " + filePath)
            return null // An error code that says "don't add this note!"
		}
		if (this.data.add_obs_tags) {
			for (let key in newNote.fields) {
				for (let match of newNote.fields[key].matchAll(OBS_TAG_REGEXP)) {
					tags.push(match[1])
				}
				newNote.fields[key] = newNote.fields[key].replace(OBS_TAG_REGEXP, "")
	        }
		}
		newNote.tags.push(...tags)
		return {note: newNote, identifier: identifier}
	}
}

class linkToDeckResolver{
    constructor() {}

    linkToDeckResolver(link: string, app: App, data: FileData): string {
        if(!link)
            return
        let tempFile = app.metadataCache.getFirstLinkpathDest(link, "")
        let deck = tempFile.path.replaceAll("/", "::")
        const index = deck.lastIndexOf('::');
        if (index != -1) {
            deck = deck.substring(0, index);
        }
        deck = data.defaultDeck + "::" + deck
        return deck
    }   
}
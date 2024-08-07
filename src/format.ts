import { AnkiConnectNote } from './interfaces/note-interface'
import { basename, extname } from 'path'
import { CachedMetadata, MarkdownRenderer, Component, App } from 'obsidian'
import * as c from './constants'
import { FileData } from './interfaces/settings-interface'

const ANKI_MATH_REGEXP:RegExp = /(\\\[[\s\S]*?\\\])|(\\\([\s\S]*?\\\))/g
const CALLOUTS_REGEXP:RegExp = /(?:>\s?\[!\w+\]-?\+?\s?)(.*)(?:\n\s*>.*)*/g

const MATH_REPLACE:string = "OBSTOANKIMATH"
const MERMAID_CODE_REPLACE = "OBSTOANKIMERMAIDDISPLAY"

const HIGHLIGHT_REGEXP:RegExp = /==(.*?)==/g
const CLOZE_REGEXP:RegExp = /(?:(?<!{){(?:c?(\d+)[:|])?(?!{))((?:[^\n][\n]?)+?)(?:(?<!})}(?!}))/g


const IMAGE_EXTS: string[] = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".tiff", ".webp"]
const AUDIO_EXTS: string[] = [".wav", ".m4a", ".flac", ".mp3", ".wma", ".aac", ".webm"]

let cloze_unset_num: number = 1

function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

export class FormatConverter {

	file_cache: CachedMetadata
	vault_name: string
	detectedMedia: Set<string>
	app: App
	path: string
	cloze: boolean
	highlights_to_cloze:  boolean
	custom_cloze: boolean

	constructor(file_cache: CachedMetadata, data:FileData, path: string, app:App) {
		this.vault_name = data.vault_name
		this.file_cache = file_cache
		this.detectedMedia = new Set()
		this.app = app
		this.path = path

		this.cloze = data.curly_cloze
		this.highlights_to_cloze = data.highlights_to_cloze
		this.custom_cloze = data.custom_cloze
	}

	getUrlFromLink(link: string): string {
        return "obsidian://open?vault=" + encodeURIComponent(this.vault_name) + String.raw`&file=` + encodeURIComponent(link)
    }

	format_note_with_url(note: AnkiConnectNote, url: string, field: string, heading?: string): void {
		if(heading)
			note.fields[field] += '<a href="' + url + "%23" + heading + '" class="obsidian-link">Obsidian</a>'
		else
		note.fields[field] += '<a href="' + url + '" class="obsidian-link">Obsidian</a>'
	}

	format_note_with_frozen_fields(note: AnkiConnectNote, frozen_fields_dict: Record<string, Record<string, string>>): void {
		for (let field in note.fields) {
			note.fields[field] += frozen_fields_dict[note.modelName][field]
		}
	}

	obsidian_to_anki_math(note_text: string): string {
		return note_text.replace(
				c.OBS_DISPLAY_MATH_REGEXP, "\\[$1\\]"
		).replace(
			c.OBS_INLINE_MATH_REGEXP,
			"\\($1\\)"
		)
	}

	cloze_repl(_1: string, match_id: string, match_content: string): string {
		if (match_id == undefined) {
			let result = "{{c" + cloze_unset_num.toString() + "::" + match_content + "}}"
			cloze_unset_num += 1
			return result
		}
		let result = "{{c" + match_id + "::" + match_content + "}}"
		return result
	}

	curly_to_cloze(text: string): string {
		/*Change text in curly brackets to Anki-formatted cloze.*/
		text = text.replace(CLOZE_REGEXP, this.cloze_repl)
		cloze_unset_num = 1
		return text
	}

	custom_cloze_JS(text: string): string {
		/*Use custom JS cloze in anki card; Format difference: single ":"*/
		text = text.replace(CLOZE_REGEXP, "{{c1:" + "$2" + "}}")
		return text
	}

	getAndFormatMedias(note_text: string): string {
		if (!(this.file_cache.hasOwnProperty("embeds"))) {
			return note_text
		}
		for (let embed of this.file_cache.embeds) {
			if (note_text.includes(embed.original) && extname(embed.link)) {
				this.detectedMedia.add(embed.link)
				if (AUDIO_EXTS.includes(extname(embed.link))) {
					note_text = note_text.replace(new RegExp(c.escapeRegex(embed.original), "g"), "[sound:" + basename(embed.link) + "]")
				} else if (IMAGE_EXTS.includes(extname(embed.link))) {
					note_text = note_text.replace(
						new RegExp(c.escapeRegex(embed.original), "g"),
						'<img src="' + basename(embed.link) + '" width="' + embed.displayText + '">'
					)
				} else if (embed.link.contains(".pdf")){
					let pageNumber = embed.link
					pageNumber = pageNumber.replace (new RegExp(/#page=(\d+)/g), "$1")
					let embedLink = basename(embed.link) + "_Page" + pageNumber + ".png"
					note_text = note_text.replace(
						new RegExp(c.escapeRegex(embed.original), "g"),
						'<img src="' + embedLink + '">')				

				} else {
					console.warn("Unsupported extension: ", extname(embed.link))
				}
			}
		}
		return note_text
	}

	formatLinks(note_text: string): string {
		if (!(this.file_cache.hasOwnProperty("links"))) {
			return note_text
		}
		for (let link of this.file_cache.links) {
			if(link.original == ""){
				console.warn("Link not working: ", link.displayText)
				continue
			}
			note_text = note_text.replace(new RegExp(c.escapeRegex(link.original), "g"), '<a href="' + this.getUrlFromLink(link.link) + '">' + encodeURIComponent(link.displayText) + "</a>")
		}
		return note_text
	}

	formatEmbedLinks(container: HTMLElement){
		let elements = container.querySelectorAll('a[data-href]');
		for (let i = 0; i < elements.length; i++) {
			elements[i].className = "";
			elements[i].attributes.removeNamedItem("data-href");
			let href = this.getUrlFromLink((elements[i] as HTMLAnchorElement).pathname.slice(1));
			if((elements[i] as HTMLAnchorElement).hash.slice(1))
				href = href + '%23' + (elements[i] as HTMLAnchorElement).hash.slice(1);
			(elements[i] as HTMLAnchorElement).href = href;
		  }
	}

	formatCallouts(note_text: string): string {
		note_text = note_text.replace(CALLOUTS_REGEXP, "{$1}")
		return note_text	
	}

	censor(note_text: string, regexp: RegExp, mask: string): [string, string[]] {
		/*Take note_text and replace every match of regexp with mask, simultaneously adding it to a string array*/
		let matches: string[] = []
		for (let match of note_text.matchAll(regexp)) {
			matches.push(match[0])
		}
		return [note_text.replace(regexp, mask), matches]
	}

	decensor(note_text: string, mask:string, replacements: string[], escape: boolean): string {
		for (let replacement of replacements) {
			note_text = note_text.replace(
				mask, escape ? escapeHtml(replacement) : replacement
			)
		}
		return note_text
	}

	formatMermaidMatches(mermaidMatches: string[]){
		for(let [idx, list_item] of mermaidMatches.entries()){
			const MERMAID_BEG_REGEXP:RegExp = /```mermaid/g
			const MERMAID_END_REGEXP:RegExp = /```/g
			mermaidMatches[idx] = mermaidMatches[idx].replace(MERMAID_BEG_REGEXP, '<div class="mermaid">')
			mermaidMatches[idx] = mermaidMatches[idx].replace(MERMAID_END_REGEXP, '</div>')
			}
		return mermaidMatches
	}

	highlight_embed(note_text: string): string{
		//TODO: Add colour option
		return note_text.replaceAll(	`<div class="markdown-preview-view markdown-rendered show-indentation-guide">`, 
									`<div class="markdown-preview-view markdown-rendered show-indentation-guide" style="background-color:rgba(245, 248, 249, 0.85);">`)
	}

	async format(note_text: string): Promise<string> {
		note_text = this.obsidian_to_anki_math(note_text)

		//Extract inline math and math blocks
		let math_matches: string[]
		[note_text, math_matches] = this.censor(note_text, ANKI_MATH_REGEXP, MATH_REPLACE);

		//Extract mermaid graphs and format them
		let mermaidMatches: string[]
		[note_text, mermaidMatches] = this.censor(note_text, c.OBS_MERMAID_REGEXP, MERMAID_CODE_REPLACE);
		mermaidMatches = this.formatMermaidMatches(mermaidMatches);

		if (this.cloze||this.custom_cloze) {
			if (this.highlights_to_cloze) {
				note_text = note_text.replace(HIGHLIGHT_REGEXP, "{$1}")
			}
			if(this.custom_cloze){
				note_text = this.custom_cloze_JS(note_text)
			} else{
				note_text = this.curly_to_cloze(note_text)
			}
		}

		note_text = this.formatCallouts(note_text)
		note_text = this.getAndFormatMedias(note_text)
		note_text = this.formatLinks(note_text)
		
		//convert markdown to html
		let container: HTMLElement = document.createElement('converter')
		let component = new Component
		await MarkdownRenderer.render(this.app, note_text, container, this.path, component)
	
		//links in embeds are not handled in formatLinks, so do it here (but worse, beacause currently not using file cache)
		this.formatEmbedLinks(container)

		note_text = container.innerHTML

		note_text = this.highlight_embed(note_text)

		note_text = this.decensor(note_text, MATH_REPLACE, math_matches, true).trim()
		note_text = this.decensor(note_text, MERMAID_CODE_REPLACE, mermaidMatches, false)
		
		return note_text
	}
}
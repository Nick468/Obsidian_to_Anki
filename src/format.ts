import { AnkiConnectNote } from './interfaces/note-interface'
import { basename, extname } from 'path'
import { CachedMetadata, MarkdownRenderer, Component } from 'obsidian'
import * as c from './constants'
import { FileData } from './interfaces/settings-interface'
import obsidian_to_anki_plugin from '../main'

const ANKI_MATH_REGEXP:RegExp = /(\\\[[\s\S]*?\\\])|(\\\([\s\S]*?\\\))/g
const CALLOUTS_REGEXP:RegExp = /(?:>\s?\[!\w+\]-?\+?\s?)(.*)(?:\n\s*>.*)*/g

const MATH_REPLACE:string = "OBSTOANKIMATH"
const MERMAID_CODE_REPLACE = "OBSTOANKIMERMAIDDISPLAY"

const HIGHLIGHT_REGEXP:RegExp = /==(.*?)==/g
const CLOZE_REGEXP:RegExp = /(?:(?<!{){(?:c?(\d+)[:|])?(?!{))((?:[^\n][\n]?)+?)(?:(?<!})}(?!}))/g

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
	detectedMedia: Set<string>
	plugin: obsidian_to_anki_plugin
	path: string
	tags: string[] = []


	constructor(file_cache: CachedMetadata, data:FileData, path: string, plugin:obsidian_to_anki_plugin) {
		this.file_cache = file_cache
		this.detectedMedia = new Set()
		this.path = path
		this.plugin = plugin
	}

	resetFormatter(){
		this.tags = []	
	}

	getUrlFromLink(link: string): string {
        return "obsidian://open?vault=" + encodeURIComponent(this.plugin.app.vault.getName()) + String.raw`&file=` + link
    }

	format_note_with_url(note: AnkiConnectNote, url: string, field: string, heading?: string): void {
		// the first note.fields contains the title -> should be the display text of the link
		// can only adress the first note.fields through fields_dict...
		// note.fields[this.plugin.fields_dict[note.modelName][0]] = text of the title
		
		if(heading)
			note.fields[field] += '<a href="' + url + "%23" + heading + '" class="obsidian-link">' + note.fields[this.plugin.fields_dict[note.modelName][0]] + '</a>'
		else
			note.fields[field] += '<a href="' + url + '" class="obsidian-link">' + note.fields[this.plugin.fields_dict[note.modelName][0]] + '</a>'
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

	getAndFormatMedias(container: HTMLElement) {
		// Pdf embed
		let elements = container.querySelectorAll('span.pdf-embed')
		for(let element of elements){
			let fileName = element.getAttribute("src").split('.pdf')[0] + ".pdf"
			let pageNumber = new RegExp(/#page=(\d+)/g).exec(element.getAttribute("src"))[1]
			this.detectedMedia.add(fileName)
			
			// Format: <canvas id="pdf" data-src="/file.pdf" data-page="N"></canvas>
			let canvas = document.createElement('canvas');
			canvas.id = "pdf"
			canvas.setAttribute('data-src', '/' + fileName);
			canvas.setAttribute('data-page', pageNumber)
			element.replaceWith(canvas)
		}

		// Image embed
		elements = container.querySelectorAll('img')
		for(let element of elements){
			let fileName = element.getAttribute("alt")
			this.detectedMedia.add(fileName)
			element.setAttribute("src", fileName)
		}

		// Audio embed
		elements = container.querySelectorAll('span.video-embed')
		for(let element of elements){
			let fileName = element.getAttribute("src")
			this.detectedMedia.add(fileName)
			element.children[0].setAttribute("src", fileName)
		}
	}

	formatLinks(container: HTMLElement){
		let elements = container.querySelectorAll('a[data-href]');
		for (let element of elements) {
			element.className = "";
			element.attributes.removeNamedItem("data-href");
			let href = this.getUrlFromLink((element as HTMLAnchorElement).pathname.slice(1));
			if((element as HTMLAnchorElement).hash.slice(1))
				href = href + '%23' + (element as HTMLAnchorElement).hash.slice(1);
			(element as HTMLAnchorElement).href = href;
		  }
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
		return note_text.replaceAll(`<div class="markdown-preview-view markdown-rendered show-indentation-guide">`, 
									`<div class="markdown-preview-view markdown-rendered show-indentation-guide" style="background-color:` + this.plugin.settings.Defaults.EmbedColour + `;">`)
	}

	async format(note_text: string): Promise<string> {
		// Extract inline math and math blocks
		note_text = this.obsidian_to_anki_math(note_text)
		let math_matches: string[]
		[note_text, math_matches] = this.censor(note_text, ANKI_MATH_REGEXP, MATH_REPLACE);

		// Extract mermaid graphs and format them
		let mermaidMatches: string[]
		[note_text, mermaidMatches] = this.censor(note_text, c.OBS_MERMAID_REGEXP, MERMAID_CODE_REPLACE);
		mermaidMatches = this.formatMermaidMatches(mermaidMatches);

		// handle cloze
		if (this.plugin.settings.Defaults.CurlyCloze||this.plugin.settings.Defaults.AnkiCustomCloze) {
			if (this.plugin.settings.Defaults.HighlightsToCloze) {
				note_text = note_text.replace(HIGHLIGHT_REGEXP, "{$1}")
			}
			if(this.plugin.settings.Defaults.AnkiCustomCloze){
				note_text = this.custom_cloze_JS(note_text)
			} else{
				note_text = this.curly_to_cloze(note_text)
			}
		}
		
		//convert markdown to html
		let container: HTMLElement = document.createElement('converter')
		let component = new Component
		await MarkdownRenderer.render(this.plugin.app, note_text, container, this.path, component)
	
		//links in embeds are not handled in formatLinks, so do it here (but worse, beacause currently not using file cache)
		this.formatLinks(container)
		this.getAndFormatMedias(container)


		if (this.plugin.settings.Defaults.AddObsidianTags) {
                let elements = container.querySelectorAll('a.tag');
                for (let i = 0; i < elements.length; i++) {
					 this.tags.push(elements[i].innerHTML.substring(1))
					 elements[i].remove()
                  }
		}

		note_text = container.innerHTML

		note_text = this.highlight_embed(note_text)

		note_text = this.decensor(note_text, MATH_REPLACE, math_matches, true).trim()
		note_text = this.decensor(note_text, MERMAID_CODE_REPLACE, mermaidMatches, false)
		
		return note_text
	}
}
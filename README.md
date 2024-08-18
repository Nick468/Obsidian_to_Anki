# My Fork of Obsidian_to_Anki
This is my fork of [Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki) (Plugin to add flashcards from a text or markdown file to Anki). It started out as a few simple modifications, but I found the codebase so convoluted that I pretty much rewrote the entire project. I added some features I thought were lacking in the origianl and tried to keep as much of the old functionality as was reasonable. 

## Caution
- This fork is far less tested. There will be bugs (especially with non-regex notes).
- This fork is not 100 % compatible with the original project. The anki cards *should* transfer over, but you will have to setup the plugin from scratch and get used to a few quirks.

## Things no longer working
- [x] Removed all tests
- [x] Removed the python scripts

## Stuff I changed
- [x] rewrote *almost* everything to make future modifications easier
	- [x] Fixed many internal regex strings leading to false positives, false negatives, catastrophic backtracking...
		- use  `^#+\s(.+)\n*((?:\n+(?!#+\s|<!--).+)+)` as [Header-Paragraph-Style](https://github.com/ObsidianToAnki/Obsidian_to_Anki/wiki/Header-paragraph-style)
- [x] New markdown renderer (obsidian's inbuilt one, not showdown)
	- [x] Make embeds of markdown files possible
	- [x] Parse markdown-horizontal lines correctly
	- [x] Fix Math Regex handling
	- [x] Remove block links from cards
	- [x] Remove obsidian comments from cards
	- [x] Format strikethrough correctly on anki card
	- [x] Handling of callouts
- [x] New UI
	- [x] New settings page
	- [x] New Interface for scan current file only and scan selected folder (right clicking)
- [X] New deck features
	- [x] Mirror the obsidian directory as the anki deck structure
	- [x] Support for a link in id comment to overwrite the anki deck (allows you to save a card (section of a note) in a differernt deck)
	- [ ] Initiate second anki request to deleete empty decks
- [X] New card features
	- [x] Insert link on anki card to open the correct section of the obsidian note directly (not just the entire note)
	- [x] Implement custom clozing system
	- [x] Added extra field which will not get updated by the plugin -> you can write to it in anki and the field will not get deleted when updating the card
	- [x] PDF support (needs special anki note type)
 	- [x] Handling of mermaid graphs (needs special anki note type)


## Example for anki note type
### Front
```html
{{#Link}}
{{Link}}
{{/Link}}
{{^Link}}
{{Title}}
{{/Link}}
{{#Extra}}
<hr>
{{Extra}}
{{/Extra}}
{{#Context}}
<hr>
{{Context}}
{{/Context}}
<a id= "hint" href="#" style="display: none"
    onclick="this.style.display='none';
    document.getElementById('data').style.visibility='visible';
    return false;">
    <hr>
    Show cloze
</a>
<span id="data" style="visibility: hidden"></span>
<script>
    text = String.raw`{{Text}}`
    text = `<hr>` + text
    if(text.includes("\{\{c")){	
    	let pattern = /\{\{c\d:.+?}}/g;
    	text = text.replace(pattern,`<span style="color:blue;">[...]</span>`)
    	document.getElementById("data").innerHTML = text
    	document.getElementById("hint").style.display='block'
    }
</script>
<script src="_mermaid.min.js"></script>
<script>mermaid.init();</script> 
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.6.172/pdf.min.js"></script>
<script>
    var pdfElements = document.querySelectorAll("[id='pdf']");   
    pdfElements.forEach(function(pdfElement) {
      pdfjsLib.getDocument(pdfElement.dataset.src).promise.then(function(pdf) {
        pdf.getPage(parseInt(pdfElement.dataset.page)).then(function(page) {
          const scale = 0.8;
          const viewport = page.getViewport({ scale: scale });
          const context = pdfElement.getContext('2d');
          pdfElement.width = viewport.width;
          pdfElement.height = viewport.height;
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          page.render(renderContext);
        });
      });
    });
</script>
```
### Back
```html
{{#Link}}
{{Link}}
{{/Link}}
{{^Link}}
{{Title}}
{{/Link}}
{{#Extra}}
<hr>
{{Extra}}
{{/Extra}}
{{#Context}}
<hr>
{{Context}}
{{/Context}}
<hr>
<span id="data"></span>
<script>
    text = String.raw`{{Text}}`
    text = text.replaceAll(/\{\{c\d:(.+?)}}/g,"<span style=\"color:blue;\">$1</span>")
    document.getElementById("data").innerHTML = text
</script>
<script src="_mermaid.min.js"></script>
<script>mermaid.init();</script> 
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.6.172/pdf.min.js"></script>
<script>
    var pdfElements = document.querySelectorAll("[id='pdf']");   
    pdfElements.forEach(function(pdfElement) {
      pdfjsLib.getDocument(pdfElement.dataset.src).promise.then(function(pdf) {
        pdf.getPage(parseInt(pdfElement.dataset.page)).then(function(page) {
          const scale = 0.8;
          const viewport = page.getViewport({ scale: scale });
          const context = pdfElement.getContext('2d');
          pdfElement.width = viewport.width;
          pdfElement.height = viewport.height;
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          page.render(renderContext);
        });
      });
    });
</script>
```
### CSS
```html
.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background-color: white;
}

 /* Background color for embeds */
.markdown-preview-view.markdown-rendered.show-indentation-guide {background-color: rgba(245, 248,
 249, 0.85)}

 /* Disable title of embed (to match my obsidian config) */
div.markdown-embed-title{display:none}
```

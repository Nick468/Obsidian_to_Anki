/*Class for managing a list of files, and their Anki requests.*/
import { ParsedSettings, FileData} from './interfaces/settings-interface'
import { App, TFile, TFolder, TAbstractFile, CachedMetadata, FileSystemAdapter, Notice } from 'obsidian'
import { AllFile } from './file'
import * as AnkiConnect from './anki'
import { basename } from 'path'
import multimatch from "multimatch"

interface addNoteResponse {
    result: number,
    error: string | null
}

interface notesInfoResponse {
    result: Array<{
        noteId: number,
        modelName: string,
        tags: string[],
        fields: Record<string, {
            order: number,
            value: string
        }>,
        cards: number[]
    }>,
    error: string | null
}

interface Requests1Result {
    0: {
        error: string | null,
        result: Array<{
            result: addNoteResponse[],
            error: string | null
        }>
    },
    1: {
        error: string | null,
        result: notesInfoResponse[]
    },
    2: any,
    3: any,
    4: any

}

function difference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
    let _difference = new Set(setA)
    for (let elem of setB) {
        _difference.delete(elem)
    }
    return _difference
}


export class FileManager {
    app: App
    data: ParsedSettings
    scanDir: TFile
    files: AllFile[] = []
    file_hashes: Record<string, string>
    added_media_set: Set<string>

    constructor(app: App, data:ParsedSettings, scanDir: TFile, file_hashes: Record<string, string>, added_media: string[]) {
        this.app = app
        this.data = data
        this.scanDir = scanDir
        this.file_hashes = file_hashes
        this.added_media_set = new Set(added_media)
    }
    
    getUrl(file: TFile): string {
        return "obsidian://open?vault=" + encodeURIComponent(this.data.vault_name) + String.raw`&file=` + encodeURIComponent(file.path)
    }

    findFilesThatAreNotIgnored(files:TFile[], data:ParsedSettings):TFile[]{
        let ignoredFiles = []
        ignoredFiles = multimatch(files.map(file => file.path), data.ignored_file_globs)

        let notIgnoredFiles = files.filter(file => !ignoredFiles.contains(file.path))
        return notIgnoredFiles;
    }

    /**
	 * Recursively traverse a TFolder and return all TFiles.
	 * @param tfolder - The TFolder to start the traversal from.
	 * @returns An array of TFiles found within the folder and its subfolders.
	 */
	getAllTFilesInFolder(tfolder) {
		const allTFiles = [];
		// Iterate through the contents of the folder
		tfolder.children.forEach((child) => {
			// If it's a TFile, add it to the result
			if (child instanceof TFile) {
                if(child.extension == "md")
				    allTFiles.push(child); 
			} else if (child instanceof TFolder) {
				// If it's a TFolder, recursively call the function on it
				const filesInSubfolder = this.getAllTFilesInFolder(child);
				allTFiles.push(...filesInSubfolder);
			}
			// Ignore other types of files or objects
		});
		return allTFiles;
	}

    getFolderPathList(file: TFile): TFolder[] {
        let result: TFolder[] = []
        let abstractFile: TAbstractFile = file
        while (abstractFile && abstractFile.hasOwnProperty('parent')) {
            result.push(abstractFile.parent)
            abstractFile = abstractFile.parent
        }
        result.pop() // Removes top-level vault
        return result
    }

    getDefaultDeck(file: TFile, folder_path_list: TFolder[]): string {
        let folder_decks = this.data.folder_decks
        for (let folder of folder_path_list) {
            // Loops over them from innermost folder
            if (folder_decks[folder.path]) {
                return folder_decks[folder.path]
            }
        }
        // If no decks specified
        return this.data.template.deckName
    }

    getDefaultTags(file: TFile, folder_path_list: TFolder[]): string[] {
        let folder_tags = this.data.folder_tags
        let tags_list: string[] = []
        for (let folder of folder_path_list) {
            // Loops over them from innermost folder
            if (folder_tags[folder.path]) {
                tags_list.push(...folder_tags[folder.path].split(" "))
            }
        }
        tags_list.push(...this.data.template.tags)
        return tags_list
    }

    dataToFileData(file: TFile): FileData {
        const folder_path_list: TFolder[] = this.getFolderPathList(file)
        let result: FileData = JSON.parse(JSON.stringify(this.data))
        //Lost regexp, so have to get them back
        result.FROZEN_REGEXP = this.data.FROZEN_REGEXP
        result.DECK_REGEXP = this.data.DECK_REGEXP
        result.TAG_REGEXP = this.data.TAG_REGEXP
        result.NOTE_REGEXP = this.data.NOTE_REGEXP
        result.INLINE_REGEXP = this.data.INLINE_REGEXP
        result.EMPTY_REGEXP = this.data.EMPTY_REGEXP
        result.template.deckName = this.getDefaultDeck(file, folder_path_list)
        result.template.tags = this.getDefaultTags(file, folder_path_list)
        return result
    }

    async genAllFiles() {
        let obsidian_files: TFile[] = [];
        if(this.scanDir instanceof TFolder){
            obsidian_files = this.getAllTFilesInFolder(this.scanDir)
        }else{
            if(this.scanDir.extension != "md")
                return
            obsidian_files.push(this.scanDir)
        }
        obsidian_files = this.findFilesThatAreNotIgnored(obsidian_files, this.data);
        
        for (let file of obsidian_files) {
            let content: string = await this.app.vault.read(file)
            const cache: CachedMetadata = this.app.metadataCache.getCache(file.path)
            const file_data = this.dataToFileData(file)
            const fullPath: string = (file.path.slice(0, -file.extension.length - 1))
            this.files.push(
                new AllFile(
                    file,
                    content,
                    file.path,
                    fullPath,
                    this.data.add_file_link ? this.getUrl(file) : "",
                    file_data,
                    cache,
                    this.app
                )
            )
        }
    }

    async initialiseFiles() {
        await this.genAllFiles()
        let files_changed: Array<AllFile> = []
        
        //filter all files in scan dir by hash
        for (let file of this.files) {
            if (!(this.file_hashes.hasOwnProperty(file.path) && file.getHash() === this.file_hashes[file.path])) {
                //Indicates it's changed or new
                console.info("Scanning ", file.path, "as it's changed or new.")
                if(await file.scanFile()){
                    //something has been found in the file
                    files_changed.push(file)
                }
            }
        }

        this.files = files_changed
    }

    requestHelper(requests: AnkiConnect.AnkiConnectRequest[], fileFunction, consoleLog: string): boolean{
        let temp    : AnkiConnect.AnkiConnectRequest[] = []

        for (let file of this.files) {
            let request: AnkiConnect.AnkiConnectRequest = fileFunction(file)
            //if(request.params.actions.length > 0)
            if(request != null)
                temp.push(request)
        }
        if(temp.length > 0){
            console.info(consoleLog)
            requests.push(AnkiConnect.multi(temp))
            return true
        }
        return false
    }

    async requests_1() {
        let requests: AnkiConnect.AnkiConnectRequest[] = []

        this.requestHelper(requests, this.getCreateDecks, "Requesting addition of new deck into Anki...")
        this.requestHelper(requests, this.getAddNotes, "Requesting addition of notes into Anki...")         //response 0
        this.requestHelper(requests, this.getNoteInfo, "Requesting card IDs of notes to be edited...")      //response 1 
        console.info("Requesting tag list...")
        requests.push(AnkiConnect.getTags())                                                                // response 2
        this.requestHelper(requests, this.getUpdateFields, "Requesting update of fields of existing notes")
        this.requestHelper(requests, this.getDeleteNotes, "Requesting deletion of notes..")
          
        let temp: AnkiConnect.AnkiConnectRequest[] = []
        console.info("Requesting addition of media...")
        for (let file of this.files) {
            const mediaLinks = difference(file.formatter.detectedMedia, this.added_media_set)
            for (let mediaLink of mediaLinks) {
                console.log("Adding media file: ", mediaLink)
                const dataFile = this.app.metadataCache.getFirstLinkpathDest(mediaLink, file.path)
                if (!(dataFile)) {
                    console.warn("Couldn't locate media file ", mediaLink)
                }
                else {
                    // Located successfully, so treat as if we've added the media
                    this.added_media_set.add(mediaLink)
                    const realPath = (this.app.vault.adapter as FileSystemAdapter).getFullPath(dataFile.path)
                    temp.push(
                        AnkiConnect.storeMediaFileByPath(
                            basename(mediaLink),
                            realPath
                        )
                    )
                }
            }
        }
        requests.push(AnkiConnect.multi(temp))

        const requests_1_result = ((await AnkiConnect.invoke('multi', {actions: requests}) as Array<Object>).slice(1) as any)
        await this.parse_requests_1(requests_1_result)
    }

    async parse_requests_1(requests_1_result:Requests1Result) {
        /*if (response[5].result.length >= 1 && response[5].result[0].error != null) {
            new Notice("Please update AnkiConnect! The way the script has added media files has changed.")
            console.warn("Please update AnkiConnect! The way the script has added media files has changed.")
        }*/

        const response = requests_1_result as Requests1Result
        let note_ids_array_by_file: Requests1Result[0]["result"]
        try {
            note_ids_array_by_file = AnkiConnect.parse(response[0])
        } catch(error) {
            console.error("Error: ", error)
            note_ids_array_by_file = response[0].result
        }


        const note_info_array_by_file: notesInfoResponse[] = AnkiConnect.parse(response[1])
        const tag_list: string[] = AnkiConnect.parse(response[2])
        
        //react to response
        for (let index in note_ids_array_by_file) {
            let i: number = parseInt(index)
            let file = this.files[i]
            let file_response: addNoteResponse[]
            try {
                file_response = AnkiConnect.parse(note_ids_array_by_file[i])
            } catch(error) {
                console.error("Error: ", error)
                file_response = note_ids_array_by_file[i].result
            }
            file.note_ids = []
            for (let index in file_response) {
                let i = parseInt(index)
                let response = file_response[i]
                try {
                    file.note_ids.push(AnkiConnect.parse(response))
                } catch (error) {
                    console.warn("Failed to add note ", file.all_notes_to_add[i], " in file", file.path, " due to error ", error)
                    file.note_ids.push(response.result)
                }
            }
        }

        for (let index in note_info_array_by_file) {
            let i: number = parseInt(index)
            let file = this.files[i]
            const file_response = AnkiConnect.parse(note_info_array_by_file[i])
            let temp: number[] = []
            for (let note_response of file_response) {
                temp.push(...note_response.cards)
            }
            file.card_ids = temp
        }
        
        for (let file of this.files) {
            file.tags = tag_list
            file.writeIDs()
            file.removeEmpties()
            if (file.file_content !== file.original_file) {
                await this.app.vault.modify(file.obsidian_file, file.file_content)
            }
        }
        await this.requests_2()
    }

    async requests_2() {
        let requests: AnkiConnect.AnkiConnectRequest[] = []
        
        this.requestHelper(requests, this.getChangeDecks, "Requesting cards to be moved to target deck...")
        //this.requestHelper(requests, this.getClearTags, "Requesting tags to be replaced...")
        this.requestHelper(requests, this.getAddTags, "")        
             
        await AnkiConnect.invoke('multi', {actions: requests})
        console.info("All done!")
    }

    getHashes(): Record<string, string> {
        let result: Record<string, string> = {}
        for (let file of this.files) {
            result[file.path] = file.getHash()
        }
        return result
    }

    getCreateDecks(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getCreateDecks()
    }

    getAddNotes(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getAddNotes()
    }

    getNoteInfo(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getNoteInfo()
    }

    getUpdateFields(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getUpdateFields()
    }

    getDeleteNotes(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getDeleteNotes()
    }

    getChangeDecks(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getChangeDecks()
    }
    
    getClearTags(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getClearTags()
    }    

    getAddTags(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getAddTags()
    }
    
}

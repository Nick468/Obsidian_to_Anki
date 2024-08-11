/*Class for managing a list of files, and their Anki requests.*/
import { FileData} from './interfaces/settings-interface'
import { App, TFile, TFolder, CachedMetadata, FileSystemAdapter, Notice } from 'obsidian'
import { AllFile } from './file'
import * as AnkiConnect from './anki'
import { basename } from 'path'
import multimatch from "multimatch"
import obsidian_to_anki_plugin from '../main';


interface response{
    result: Array<{ //result of all the operations of one operation type (i.e. addFile, addDeck...)
		result: Array<{ // result of all the operations of one file in one operation type
			result: number | null // result of single operation (i.e. add one single card)
			error: string | null
		}>
		error: string | null
        }>
    error: string | null
}

interface Requests1Result {
    0: response
    1: response
    2: response
    3: response
    4: response
    5: response
}

function difference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
    let _difference = new Set(setA)
    for (let elem of setB) {
        _difference.delete(elem)
    }
    return _difference
}

export class FileManager {
    plugin: obsidian_to_anki_plugin
    app: App
    fileData: FileData
    scanDir: TFile
    files: AllFile[] = []
    file_hashes: Record<string, string>
    added_media_set: Set<string>

    constructor(plugin: obsidian_to_anki_plugin, fileData:FileData, scanDir: TFile, file_hashes: Record<string, string>, added_media: string[]) {
        this.plugin = plugin
        this.app = plugin.app
        this.fileData = fileData
        this.scanDir = scanDir
        this.file_hashes = file_hashes
        this.added_media_set = new Set(added_media)
    }
    
    async genAllFiles() {
        let obsidian_files: TFile[] = [];
        if(this.scanDir instanceof TFolder){
            obsidian_files = this.getAllTFilesInFolder(this.scanDir)
        }else{
            if(this.scanDir.extension != "md")
                new Error("Can only initiate search on markdown files")
            obsidian_files.push(this.scanDir)
        }
        obsidian_files = this.findFilesThatAreNotIgnored(obsidian_files, this.plugin.settings.IGNORED_FILE_GLOBS);
        
        for (let file of obsidian_files) {
            let content: string = await this.app.vault.read(file)
            const cache: CachedMetadata = this.app.metadataCache.getCache(file.path)
            this.files.push(
                new AllFile(
                    file,
                    content,
                    cache,
                    structuredClone(this.fileData),
                    this.plugin
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

    async requests_1() {
        let requests: AnkiConnect.AnkiConnectRequest[] = []
        let additionRequest: AllFile[] = null
        let createDeckRequest: boolean = false

        this.requestHelper(requests, this.createNewDecks, "Requesting addition of new decks for new notes...", true) ? createDeckRequest = true : createDeckRequest = false
        additionRequest = this.requestHelper(requests, this.getAddNotes, "Requesting addition of new notes ...", true)
        this.requestHelper(requests, this.getUpdateNotes, "Requesting editing of existing notes...") 
        this.requestHelper(requests, this.getDeleteNotes, "Requesting deletion of notes..")
        this.requestHelper(requests, this.getChangeDecks, "Requesting cards to be moved to target deck...")
        this.addMediaRequest(requests)

        if(requests.length > 0){
            const requests_1_result: Requests1Result = ((await AnkiConnect.invoke('multi', {actions: requests}) as Array<Object>) as any)
            await this.parse_requests_1(requests_1_result, createDeckRequest, additionRequest)
        }
    }

    async parse_requests_1(response:Requests1Result, createDeckRequest:boolean, additionRequest: AllFile[]) {
        // print all anki errors to the console
        for(let i = 0; i<5; i++){
            if(!response[i])
                continue
            if(response[i].error)
                console.log("Error: " + response[i].error)
            else{
                for(let j = 0; j<response[i].result.length; j++){
                    if(response[i].result[j].error)
                        console.log("Error: " + response[i].result[j].error)
                    else{
                        for(let k = 0; k<response[i].result[j].result.length; k++){
                            if(response[i].result[j].result[k].error)
                                console.log("Error: " + response[i].result[j].result[k].error)
                        }
                    }
                }
            }
        }

        // Get the note_ids for the newly created cards reported from anki
        // add them to the note object, then call writeID 
        if(additionRequest != null){
            let new_note_ids: Requests1Result[0]["result"]
            try {
                if(createDeckRequest)
                    new_note_ids = AnkiConnect.parse(response[1])
                else
                    new_note_ids = AnkiConnect.parse(response[0])
            } catch(error) {
                console.error("Error: ", error)
                new_note_ids = response[0].result
            }

            for (let i = 0; i < new_note_ids.length; i++) { 
                let file:AllFile = additionRequest[i]
                let new_note_ids_file = new_note_ids[i]

                for(let j = 0; j < new_note_ids_file.result.length; j++){
                    file.all_notes_to_add[j].identifier = new_note_ids_file.result[j].result
                }
              }
        }

        // write the newly found note ids to the file
        for (let file of this.files) {
            file.writeIDs()
            file.fix_newline_ids()
            file.removeEmpties()
            if (file.file_content !== file.original_file_content) {
                await this.app.vault.modify(file.obsidian_file, file.file_content)
            }
        }
    }

    findFilesThatAreNotIgnored(files:TFile[], ignored_file_globs:string[]):TFile[]{
        let ignoredFiles = []
        ignoredFiles = multimatch(files.map(file => file.path), ignored_file_globs)

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

    getHashes(): Record<string, string> {
        let result: Record<string, string> = {}
        for (let file of this.files) {
            result[file.path] = file.getHash()
        }
        return result
    }

    // anki request functions

    requestHelper(requests: AnkiConnect.AnkiConnectRequest[], fileFunction, consoleLog: string, logFiles: boolean = false): AllFile[]{
        let temp: AnkiConnect.AnkiConnectRequest[] = []
        let fileLog: AllFile[] = []

        for (let file of this.files) {
            let request: AnkiConnect.AnkiConnectRequest = fileFunction(file)
            if(request != null){
                temp.push(request)
                if(logFiles)
                    fileLog.push(file)
            }
        }
        if(temp.length > 0){
            console.info(consoleLog)
            requests.push(AnkiConnect.multi(temp))
            if(logFiles)
                return fileLog
            return null
        }
        return null
    }

    addMediaRequest(requests: AnkiConnect.AnkiConnectRequest[]) {
        let temp: AnkiConnect.AnkiConnectRequest[] = []
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
        if(temp.length > 0){
            requests.push(AnkiConnect.multi(temp))
            console.info("Requesting addition of media...")
        }
    }

    createNewDecks(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.createNewDecks()
    }

    getAddNotes(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getAddNotes()
    }

    getUpdateNotes(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getUpdateNotes()
    }

    getDeleteNotes(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getDeleteNotes()
    }

    getChangeDecks(file: AllFile): AnkiConnect.AnkiConnectRequest{
        return file.getChangeDecks()
    }   
}

export interface AnkiConnectNote {
	deckName: string,
	modelName: string,
	fields: Record<string, string>,
	options: {
		allowDuplicate: boolean,
		duplicateScope: string
	}
	tags: Array<string>,
}

export interface AnkiConnectNoteAndID {
	note: AnkiConnectNote,
	identifier: number | null
	identifierPosition?: number
}

export interface RegexMatch {
	allMatch: string,
	title: string,
	text: string,
	tags?: string,
	id?: string,
	link?: string,
	idTags?: string
}
import { Portal } from './portal.model'

export class AddTutorial {
    static readonly type = '[TUTORIAL] Add'

    constructor(public payload: Portal) {}
}

export class RemoveTutorial {
    static readonly type = '[TUTORIAL] Remove'

    constructor(public payload: string) {}
}
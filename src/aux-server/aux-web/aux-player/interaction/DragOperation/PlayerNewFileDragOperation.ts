import { BaseFileDragOperation } from '../../../shared/interaction/DragOperation/BaseFileDragOperation';
import {
    File,
    FileCalculationContext,
    BotAction,
    isFileMovable,
    merge,
    createFile,
    fileAdded,
    PartialFile,
    CREATE_ACTION_NAME,
    FileDragMode,
} from '@casual-simulation/aux-common';
import { PlayerInteractionManager } from '../PlayerInteractionManager';
import { PlayerSimulation3D } from '../../scene/PlayerSimulation3D';
import { PlayerFileDragOperation } from './PlayerFileDragOperation';
import { InventorySimulation3D } from '../../scene/InventorySimulation3D';
import { VRController3D } from '../../../shared/scene/vr/VRController3D';

export class PlayerNewFileDragOperation extends PlayerFileDragOperation {
    private _fileAdded: boolean;

    /**
     * Create a new drag rules.
     */
    constructor(
        playerSimulation: PlayerSimulation3D,
        inventorySimulation: InventorySimulation3D,
        interaction: PlayerInteractionManager,
        file: File,
        context: string,
        vrController: VRController3D | null
    ) {
        super(
            playerSimulation,
            inventorySimulation,
            interaction,
            [file],
            context,
            vrController
        );
    }

    protected _updateFile(file: File, data: PartialFile): BotAction {
        if (!this._fileAdded) {
            // Add the duplicated file.
            this._file = merge(this._file, data || {});
            this._file = createFile(undefined, this._file.tags);
            this._files = [this._file];
            this._fileAdded = true;

            return fileAdded(this._file);
        } else {
            return super._updateFile(this._file, data);
        }
    }

    protected _onDragReleased(calc: FileCalculationContext): void {
        if (this._fileAdded) {
            this.simulation.helper.action(CREATE_ACTION_NAME, this._files);
        }
        super._onDragReleased(calc);
    }

    protected _canDragWithinContext(mode: FileDragMode): boolean {
        return true;
    }

    protected _canDragOutOfContext(mode: FileDragMode): boolean {
        return true;
    }
}

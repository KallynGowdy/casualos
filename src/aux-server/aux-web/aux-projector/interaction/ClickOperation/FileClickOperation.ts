
import { FileDragOperation } from '../DragOperation/FileDragOperation';
import { Vector2, Vector3, Intersection } from 'three';
import GameView from '../../GameView/GameView';
import { InteractionManager } from '../InteractionManager';
import {
    UserMode,
    File,
    duplicateFile,
    AuxFile,
    FileCalculationContext,
    getFileIndex,
    getFilePosition
} from '@yeti-cgi/aux-common';
import { Physics } from '../../../shared/scene/Physics';
import { WorkspaceMesh } from '../../../shared/scene/WorkspaceMesh';
import { appManager } from '../../../shared/AppManager';
import { BaseFileClickOperation } from './BaseFileClickOperation';
import { BaseFileDragOperation } from '../DragOperation/BaseFileDragOperation';
import { AuxFile3D } from '../../../shared/scene/AuxFile3D';
import { ContextGroup3D } from '../../../shared/scene/ContextGroup3D';
import { objectsAtGridPosition } from '../../../shared/scene/SceneUtils';

/**
 * File Click Operation handles clicking of files for mouse and touch input with the primary (left/first finger) interaction button.
 */
export class FileClickOperation extends BaseFileClickOperation {

    private _hit: Intersection;

    constructor(mode: UserMode, gameView: GameView, interaction: InteractionManager, file: AuxFile3D | ContextGroup3D, hit: Intersection) {
        super(mode, gameView, interaction, file.file, file);
        this._file3D = file;
        this._hit = hit;
    }

    protected _getWorkspace(): ContextGroup3D | null {
        return this._file3D instanceof ContextGroup3D ? this._file3D : null;
    }

    protected _createDragOperation(calc: FileCalculationContext): BaseFileDragOperation {
        // TODO: Be able to use different domains
        const workspace = this._getWorkspace();
        if (!workspace) {
            const file3D: AuxFile3D = <AuxFile3D>this._file3D;
            const fileWorkspace = this._interaction.findWorkspaceForMesh(this._file3D);
            const position = getFilePosition(calc, file3D.file, file3D.context);
            if (fileWorkspace && position) {
                const objects = objectsAtGridPosition(calc, fileWorkspace, position);
                if (objects.length === 0) {
                    console.log('Found no objects at', position);
                    console.log(file3D.file);
                    console.log(file3D.context);
                }
                const file = this._file;
                const index = getFileIndex(calc, file, file3D.context);
                const draggedObjects = objects.filter(o => getFileIndex(calc, o.file, o.context) >= index)
                    .map(o => o.file);
                return new FileDragOperation(this._gameView, this._interaction, this._hit, draggedObjects, <ContextGroup3D>workspace, file3D.context);
            }
        }
        return new FileDragOperation(this._gameView, this._interaction, this._hit, [this._file3D.file], <ContextGroup3D>workspace, null);
    }

    protected _performClick(calc: FileCalculationContext): void {
        const workspace = this._getWorkspace();
        // If we let go of the mouse button without starting a drag operation, this constitues a 'click'.
        if (!workspace) {

            if (this._interaction.isInCorrectMode(this._file3D)) {
                // Select the file we are operating on.
                this._interaction.selectFile(<AuxFile3D>this._file3D);
            }

            // If we're clicking on a workspace show the context menu for it.
        } else if(workspace) {

            if (!this._interaction.isInCorrectMode(this._file3D) && this._gameView.selectedRecentFile) {
                // Create file at clicked workspace position.
                let workspaceMesh = workspace.surface;
                let closest = workspaceMesh.closestTileToPoint(this._hit.point);

                if (closest) {
                    const context = this._interaction.firstContextInWorkspace(workspace);
                    let newFile = duplicateFile(this._gameView.selectedRecentFile, {
                        tags: {
                            [context]: true,
                            [`${context}.x`]: closest.tile.gridPosition.x,
                            [`${context}.y`]: closest.tile.gridPosition.y,
                            [`${context}.z`]: closest.tile.localPosition.y,
                            [`${context}.index`]: 0
                        }
                    });

                    appManager.fileManager.createFile(newFile.id, newFile.tags);
                }
            } else {
                this._interaction.showContextMenu(calc);
            }
        }
    }
}
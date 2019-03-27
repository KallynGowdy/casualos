import { BaseFileClickOperation } from "../../../shared/interaction/ClickOperation/BaseFileClickOperation";
import GameView from "../../GameView/GameView";
import { AuxFile3D } from "../../../shared/scene/AuxFile3D";
import { Intersection } from "three";
import { PlayerInteractionManager } from "../PlayerInteractionManager";
import { FileCalculationContext, getFilePosition, objectsAtContextGridPosition, getFileIndex } from "@yeti-cgi/aux-common";
import { appManager } from "../../../shared/AppManager";
import { BaseFileDragOperation } from "../../../shared/interaction/DragOperation/BaseFileDragOperation";
import { PlayerFileDragOperation } from "../DragOperation/PlayerFileDragOperation";

export class PlayerFileClickOperation extends BaseFileClickOperation {

    // This overrides the base class BaseInteractionManager
    protected _interaction: PlayerInteractionManager;
    // This overrides the base class IGameView
    protected _gameView: GameView;

    private _hit: Intersection;

    constructor(gameView: GameView, interaction: PlayerInteractionManager, file: AuxFile3D, hit: Intersection) {
        super(gameView, interaction, file.file, file);
        this._hit = hit;
    }

    protected _performClick(calc: FileCalculationContext): void {
        appManager.fileManager.action('onClick', [this._file]);
    }
    
    protected _createDragOperation(calc: FileCalculationContext): BaseFileDragOperation {
        const file3D: AuxFile3D = <AuxFile3D>this._file3D;
        const context = file3D.context;
        const position = getFilePosition(calc, file3D.file, context);
        if (position) {
            const objects = objectsAtContextGridPosition(calc, context, position);
            if (objects.length === 0) {
                console.log('Found no objects at', position);
                console.log(file3D.file);
                console.log(context);
            }
            const file = this._file;
            const index = getFileIndex(calc, file, file3D.context);
            const draggedObjects = objects.filter(o => getFileIndex(calc, o, context) >= index).map(o => o);
            return new PlayerFileDragOperation(this._gameView, this._interaction, this._hit, draggedObjects, file3D.context);
        }

        return null;
    }
}
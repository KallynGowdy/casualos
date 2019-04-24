import { Intersection, Vector3 } from 'three';
import { Physics } from '../../../shared/scene/Physics';
import {
    File,
    Workspace,
    DEFAULT_WORKSPACE_SCALE,
    fileRemoved,
    fileUpdated,
} from '@casual-simulation/aux-common/Files';
import { keys } from 'lodash';
import { gridPosToRealPos, Axial, posToKey } from '../../../shared/scene/hex';
import {
    FileCalculationContext,
    getContextMinimized,
    getContextSize,
    getBuilderContextGrid,
} from '@casual-simulation/aux-common/Files/FileCalculations';
import { ContextGroup3D } from '../../../shared/scene/ContextGroup3D';
import { BuilderGroup3D } from '../../../shared/scene/BuilderGroup3D';
import { appManager } from '../../../shared/AppManager';
import GameView from '../../GameView/GameView';
import { BuilderInteractionManager } from '../BuilderInteractionManager';
import { BaseBuilderFileDragOperation } from './BaseBuilderFileDragOperation';

/**
 * File Drag Operation handles dragging of files for mouse and touch input.
 */
export class BuilderFileDragOperation extends BaseBuilderFileDragOperation {
    // This overrides the base class BaseInteractionManager
    protected _interaction: BuilderInteractionManager;
    // This overrides the base class IGameView
    protected _gameView: GameView;

    private _workspace: BuilderGroup3D;
    private _attachWorkspace: ContextGroup3D;
    private _attachPoint: Axial;

    private _workspaceDelta: Vector3;

    /**
     * Create a new drag rules.
     */
    constructor(
        gameView: GameView,
        interaction: BuilderInteractionManager,
        hit: Intersection,
        files: File[],
        workspace: BuilderGroup3D,
        context: string
    ) {
        super(gameView, interaction, files, context);

        this._workspace = workspace;

        if (this._workspace) {
            // calculate the delta needed to be applied to the pointer
            // positions to have the pointer drag around the originally tapped point
            // instead of where the anchor is.
            this._workspaceDelta = new Vector3()
                .copy(this._workspace.position)
                .sub(hit.point);
            this._workspaceDelta.setY(0);
        }
    }

    protected _onDrag(calc: FileCalculationContext) {
        if (this._workspace) {
            //stop workspace dragging
        } else {
            super._onDrag(calc);
        }
    }

    protected _disposeCore() {
        super._disposeCore();
    }
}

import {
    Vector2,
    Vector3,
    Intersection,
    Raycaster,
    Object3D,
    Ray,
    Camera,
    PerspectiveCamera,
    OrthographicCamera,
} from 'three';
import {
    ContextMenuEvent,
    ContextMenuAction,
} from '../../shared/interaction/ContextMenuEvent';
import {
    File,
    Workspace,
    DEFAULT_WORKSPACE_HEIGHT_INCREMENT,
    DEFAULT_WORKSPACE_MIN_HEIGHT,
    DEFAULT_USER_MODE,
    UserMode,
    DEFAULT_WORKSPACE_HEIGHT,
    objectsAtWorkspace,
    isMinimized,
    FileCalculationContext,
    getContextMinimized,
    getBuilderContextGrid,
    getContextSize,
    getContextScale,
    getContextDefaultHeight,
    getContextColor,
    createFile,
    isContext,
    getFileConfigContexts,
    filesInContext,
    AuxObject,
    toast,
    PartialFile,
    isVisibleContext,
} from '@casual-simulation/aux-common';
import { BuilderFileClickOperation } from '../../aux-projector/interaction/ClickOperation/BuilderFileClickOperation';
import { Physics } from '../../shared/scene/Physics';
import { flatMap, minBy, keys, uniqBy } from 'lodash';
import {
    Axial,
    realPosToGridPos,
    gridDistance,
    keyToPos,
    posToKey,
} from '../../shared/scene/hex';
import { Input } from '../../shared/scene/Input';
import { IOperation } from '../../shared/interaction/IOperation';
import { BuilderEmptyClickOperation } from '../../aux-projector/interaction/ClickOperation/BuilderEmptyClickOperation';
import { BuilderNewFileClickOperation } from '../../aux-projector/interaction/ClickOperation/BuilderNewFileClickOperation';
import { AuxFile3D } from '../../shared/scene/AuxFile3D';
import { ContextGroup3D } from '../../shared/scene/ContextGroup3D';
import { BuilderGroup3D } from '../../shared/scene/BuilderGroup3D';
import { BaseInteractionManager } from '../../shared/interaction/BaseInteractionManager';
import { GameObject } from '../../shared/scene/GameObject';
import MiniFile from '../MiniFile/MiniFile';
import FileTag from '../FileTag/FileTag';
import FileTable from '../FileTable/FileTable';
import { BrowserSimulation } from '@casual-simulation/aux-vm-browser';
import { BuilderSimulation3D } from '../scene/BuilderSimulation3D';
import { DraggableGroup } from '../../shared/interaction/DraggableGroup';
import FileID from '../FileID/FileID';
import { CameraControls } from '../../shared/interaction/CameraControls';
import {
    Orthographic_MinZoom,
    Orthographic_MaxZoom,
} from '../../shared/scene/CameraRigFactory';
import { CameraRigControls } from '../../shared/interaction/CameraRigControls';
import { BuilderFileIDClickOperation } from './ClickOperation/BuilderFileIDClickOperation';
import { BuilderGame } from '../scene/BuilderGame';
import { BuilderMiniFileClickOperation } from './ClickOperation/BuilderMiniFileClickOperation';
import { copyFilesFromSimulation } from '../../shared/SharedUtils';
import { VRController3D } from '../../shared/scene/vr/VRController3D';

export class BuilderInteractionManager extends BaseInteractionManager {
    // This overrides the base class Game.
    protected _game: BuilderGame;

    protected _surfaceColliders: DraggableGroup[];
    protected _surfaceObjectsDirty: boolean;

    mode: UserMode = DEFAULT_USER_MODE;

    get selectionMode() {
        return this._game.simulation3D.simulation.selection.mode;
    }

    constructor(game: BuilderGame) {
        super(game);
        this._surfaceObjectsDirty = true;
    }

    createGameObjectClickOperation(
        gameObject: GameObject,
        hit: Intersection,
        vrController: VRController3D | null
    ): IOperation {
        if (
            gameObject instanceof AuxFile3D ||
            gameObject instanceof ContextGroup3D
        ) {
            let fileClickOp = new BuilderFileClickOperation(
                this._game.simulation3D,
                this,
                gameObject,
                hit,
                vrController
            );
            return fileClickOp;
        } else {
            return null;
        }
    }

    createEmptyClickOperation(vrController: VRController3D | null): IOperation {
        let emptyClickOp = new BuilderEmptyClickOperation(
            this._game,
            this,
            vrController
        );
        return emptyClickOp;
    }

    createHtmlElementClickOperation(
        element: HTMLElement,
        vrController: VRController3D | null
    ): IOperation {
        const vueElement: any = Input.getVueParent(element);

        if (vueElement instanceof MiniFile) {
            const file = vueElement.file;
            return new BuilderMiniFileClickOperation(
                this._game.simulation3D,
                this,
                file,
                vrController
            );
        } else if (vueElement instanceof FileTag && vueElement.allowCloning) {
            const tag = vueElement.tag;
            const table = vueElement.$parent;
            if (table instanceof FileTable) {
                if (table.files.length === 1) {
                    const file = table.files[0];
                    const newFile = createFile(file.id, {
                        [tag]: file.tags[tag],
                        'aux.mod': true,
                        'aux.mod.mergeTags': [tag],
                    });
                    return new BuilderNewFileClickOperation(
                        this._game.simulation3D,
                        this,
                        newFile,
                        vrController
                    );
                } else {
                    console.log('not valid');
                }
            } else {
                console.log('Not table');
            }
        } else if (vueElement instanceof FileID) {
            const state = this._game.simulation3D.simulation.helper.filesState;

            if (state[vueElement.files.id]) {
                return new BuilderFileIDClickOperation(
                    this._game.simulation3D,
                    this,
                    vueElement.files,
                    vrController
                );
            } else {
                return new BuilderNewFileClickOperation(
                    this._game.simulation3D,
                    this,
                    vueElement.files,
                    vrController
                );
            }
        }

        return null;
    }

    findGameObjectForHit(hit: Intersection): GameObject {
        if (!hit) {
            return null;
        }

        let obj = this.findGameObjectUpHierarchy(hit.object);

        if (obj) {
            return obj;
        } else {
            return this.findWorkspaceForIntersection(hit);
        }
    }

    findWorkspaceForIntersection(hit: Intersection): BuilderGroup3D {
        if (!hit) {
            return null;
        }

        return this.findWorkspaceForMesh(hit.object);
    }

    findWorkspaceForMesh(mesh: Object3D): BuilderGroup3D {
        if (!mesh) {
            return null;
        }

        if (mesh instanceof BuilderGroup3D) {
            return mesh;
        } else if (mesh instanceof AuxFile3D) {
            return <BuilderGroup3D>mesh.contextGroup;
        } else {
            return this.findWorkspaceForMesh(mesh.parent);
        }
    }

    canShrinkWorkspace(calc: FileCalculationContext, file: ContextGroup3D) {
        if (!file) {
            return false;
        }
        const size = getContextSize(calc, file.file);
        if (size > 1) {
            if (size === 1) {
                // Can only shrink to zero size if there are no objects on the workspace.
                const allObjects = flatMap(this._game.getSimulations(), s => {
                    return s.contexts.map(c => c.file);
                });
                const workspaceObjects = objectsAtWorkspace(
                    allObjects,
                    file.file.id
                );
                if (workspaceObjects && workspaceObjects.length > 0) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    /**
     * Determines if we're in the correct mode to manipulate the given file.
     * @param file The file.
     */
    isInCorrectMode(file: AuxFile3D | ContextGroup3D) {
        if (!file) {
            return true;
        }
        if (file instanceof ContextGroup3D) {
            return this.mode === 'worksurfaces';
        } else {
            return this.mode === 'files';
        }
    }

    /**
     * Determines if we're currently in worksurfaces mode.
     */
    isInWorksurfacesMode() {
        return this.mode === 'worksurfaces';
    }

    /**
     * Raises the tile at the given point by the given amount.
     * @param file The file.
     * @param position The tile position.
     * @param height The new height.
     */
    updateTileHeightAtGridPosition(file: ContextGroup3D, height: number) {
        let partial: PartialFile = {
            tags: {},
        };

        partial.tags[`aux.context.surface.grid.0:0`] = height;

        this._game.simulation3D.simulation.helper.updateFile(
            file.file,
            partial
        );
    }

    handlePointerEnter(file: File, simulation: BrowserSimulation): void {}

    handlePointerExit(file: File, simulation: BrowserSimulation): void {}

    handlePointerDown(file: File, simulation: BrowserSimulation): void {}

    /**
     * Calculates the grid location and workspace that the given page position intersects with.
     * @param input The input to find the grid position under. This can be either a Vector2 page position (Browser) or a ray (VR).
     */
    pointOnWorkspaceGrid(calc: FileCalculationContext, input: Vector2 | Ray) {
        const workspaceGroups = this.getSurfaceObjectGroups(calc);

        for (let i = 0; i < workspaceGroups.length; i++) {
            const objects = workspaceGroups[i].objects;
            const camera = workspaceGroups[i].camera;
            const viewport = workspaceGroups[i].viewport;

            let hits: Physics.RaycastResult;

            if (input instanceof Vector2) {
                let screenPos: Vector2;
                if (viewport) {
                    screenPos = Input.screenPositionForViewport(
                        input,
                        viewport
                    );
                } else {
                    screenPos = Input.screenPosition(
                        input,
                        this._game.gameView.gameView
                    );
                }

                hits = Physics.raycastAtScreenPos(screenPos, objects, camera);
            } else if (input instanceof Ray) {
                hits = Physics.raycast(input, objects);
            } else {
                return {
                    good: false,
                };
            }

            const hit = Physics.firstRaycastHit(hits);

            if (hit) {
                const point = hit.point;
                const workspace = this.findWorkspaceForIntersection(hit);
                if (
                    workspace &&
                    isContext(calc, workspace.file) &&
                    !getContextMinimized(calc, workspace.file)
                ) {
                    const workspaceMesh = workspace.surface;
                    const closest = workspaceMesh.closestTileToPoint(point);

                    if (closest) {
                        return {
                            good: true,
                            gridPosition: closest.tile.gridPosition,
                            workspace,
                        };
                    }
                } else {
                    return {
                        good: false,
                    };
                }
            }
        }

        return {
            good: false,
        };
    }

    /**
     * Gets the first context that the given workspace has.
     */
    firstContextInWorkspace(workspace: ContextGroup3D): string {
        const contexts = [...workspace.contexts.keys()];
        if (contexts.length > 0) {
            return contexts[0];
        }
        return null;
    }

    getSurfaceObjectGroups(calc: FileCalculationContext): DraggableGroup[] {
        if (this._surfaceObjectsDirty) {
            const builderSimulations = this._game
                .getSimulations()
                .filter(s => s instanceof BuilderSimulation3D);

            const builderContexts = flatMap(
                builderSimulations,
                s => s.contexts
            ).filter(c => isContext(calc, c.file));

            const builderActiveContexts = builderContexts.filter(c =>
                isVisibleContext(calc, c.file)
            );

            const surfaceObjects = flatMap(
                builderActiveContexts,
                c => (<BuilderGroup3D>c).surface.colliders
            );

            this._surfaceColliders = [
                {
                    objects: surfaceObjects,
                    camera: this._game.getMainCameraRig().mainCamera,
                    viewport: this._game.getMainCameraRig().viewport,
                },
            ];

            this._surfaceObjectsDirty = false;
        }

        return this._surfaceColliders;
    }

    protected findWorkspaceForHit(hit: Intersection) {}

    protected _markDirty() {
        super._markDirty();
        this._surfaceObjectsDirty = true;
    }

    protected _createControlsForCameraRigs(): CameraRigControls[] {
        let mainCameraRigControls: CameraRigControls = {
            rig: this._game.getMainCameraRig(),
            controls: new CameraControls(
                this._game.getMainCameraRig().mainCamera,
                this._game,
                this._game.getMainCameraRig().viewport
            ),
        };

        mainCameraRigControls.controls.minZoom = Orthographic_MinZoom;
        mainCameraRigControls.controls.maxZoom = Orthographic_MaxZoom;

        if (
            mainCameraRigControls.rig.mainCamera instanceof OrthographicCamera
        ) {
            mainCameraRigControls.controls.screenSpacePanning = true;
        }

        return [mainCameraRigControls];
    }

    protected _contextMenuActions(
        calc: FileCalculationContext,
        gameObject: GameObject,
        point: Vector3
    ): ContextMenuAction[] {
        let actions: ContextMenuAction[] = [];

        if (gameObject) {
            if (
                gameObject instanceof ContextGroup3D &&
                isContext(calc, gameObject.file)
            ) {
                const tile = this._worldPosToGridPos(calc, gameObject, point);
                const currentGrid = getBuilderContextGrid(
                    calc,
                    gameObject.file
                );
                const currentTile = currentGrid ? currentGrid['0:0'] : null;
                const defaultHeight = getContextDefaultHeight(
                    calc,
                    gameObject.file
                );
                let currentHeight =
                    (!!currentGrid ? currentGrid['0:0'] : defaultHeight) ||
                    DEFAULT_WORKSPACE_HEIGHT;
                const increment = DEFAULT_WORKSPACE_HEIGHT_INCREMENT; // TODO: Replace with a configurable value.
                const minHeight = DEFAULT_WORKSPACE_MIN_HEIGHT; // TODO: This too
                const minimized = isMinimized(calc, gameObject.file);

                const minimizedLabel = minimized ? 'Maximize' : 'Minimize';
                actions.push({
                    label: minimizedLabel,
                    onClick: () => this._toggleWorkspace(calc, gameObject),
                });

                actions.push({
                    label: 'Go to Context',
                    onClick: () => this._switchToPlayer(calc, gameObject),
                });

                actions.push({
                    label: 'Edit Bot',
                    onClick: () => this._selectContextFile(calc, gameObject),
                });

                actions.push({
                    label: 'Copy',
                    onClick: () => this._copyWorkspace(calc, gameObject),
                });

                actions.push({
                    label: 'Expand',
                    onClick: () => this._expandWorkspace(calc, gameObject),
                });
                if (this.canShrinkWorkspace(calc, gameObject)) {
                    actions.push({
                        label: 'Shrink',
                        onClick: () => this._shrinkWorkspace(calc, gameObject),
                    });
                }

                if (!minimized) {
                    actions.push({
                        label: 'Raise',
                        onClick: () =>
                            this._setAllHexHeight(
                                calc,
                                gameObject,
                                currentHeight + increment
                            ),
                    });
                    if (currentTile && currentHeight - increment >= minHeight) {
                        actions.push({
                            label: 'Lower',
                            onClick: () =>
                                this._setAllHexHeight(
                                    calc,
                                    gameObject,
                                    currentHeight - increment
                                ),
                        });
                    }
                }
            }
        }

        return actions;
    }

    private _shrinkWorkspace(
        calc: FileCalculationContext,
        file: ContextGroup3D
    ) {
        if (file && isContext(calc, file.file)) {
            const size = getContextSize(calc, file.file);
            this._game.simulation3D.simulation.helper.updateFile(file.file, {
                tags: {
                    [`aux.context.surface.size`]: (size || 0) - 1,
                },
            });
        }
    }

    /**
     * On raise or lower, set all hexes in workspace to given height
     * @param file
     */
    private _setAllHexHeight(
        calc: FileCalculationContext,
        gameObject: ContextGroup3D,
        height: number
    ) {
        if (gameObject instanceof BuilderGroup3D) {
            let tiles = gameObject.surface.hexGrid.hexes.map(
                hex => hex.gridPosition
            );

            this.updateTileHeightAtGridPosition(gameObject, height);
        }
    }

    /**
     * Minimizes or maximizes the given workspace.
     * @param file
     */
    private _toggleWorkspace(
        calc: FileCalculationContext,
        file: ContextGroup3D
    ) {
        if (file && isContext(calc, file.file)) {
            const minimized = !isMinimized(calc, file.file);
            this._game.simulation3D.simulation.helper.updateFile(file.file, {
                tags: {
                    [`aux.context.surface.minimized`]: minimized,
                },
            });
        }
    }

    /**
     * Copies all the files on the workspace to the given user's clipboard.
     * @param file
     */
    private async _copyWorkspace(
        calc: FileCalculationContext,
        file: ContextGroup3D
    ) {
        if (file && isContext(calc, file.file)) {
            const contexts = getFileConfigContexts(calc, file.file);
            const files = flatMap(contexts, c => filesInContext(calc, c));
            const deduped = uniqBy(files, f => f.id);
            await copyFilesFromSimulation(file.simulation3D.simulation, <
                AuxObject[]
            >deduped);

            await file.simulation3D.simulation.helper.transaction(
                toast('Worksurface Copied!')
            );
        }
    }

    private _expandWorkspace(
        calc: FileCalculationContext,
        file: ContextGroup3D
    ) {
        if (file) {
            const size = getContextSize(calc, file.file);
            this._game.simulation3D.simulation.helper.updateFile(file.file, {
                tags: {
                    [`aux.context.surface.size`]: (size || 0) + 1,
                },
            });
        }
    }

    private _selectContextFile(
        calc: FileCalculationContext,
        file: ContextGroup3D
    ) {
        this._game.simulation3D.simulation.selection.selectFile(
            file.file,
            false,
            this._game.simulation3D.simulation.filePanel
        );
    }

    private _switchToPlayer(
        calc: FileCalculationContext,
        file: ContextGroup3D
    ) {
        let contexts = getFileConfigContexts(calc, file.file);
        let context = contexts[0];

        // https://auxbuilder.com/
        //   ^     |     host    |     path           |
        // simulationId: ''
        const simulationId = window.location.pathname.split('/')[2];

        const url = new URL(
            `/${context}/${simulationId || 'default'}`,
            window.location.href
        );

        // open in new tab
        window.open(url.href, '_blank');
    }

    private _worldPosToGridPos(
        calc: FileCalculationContext,
        file: ContextGroup3D,
        pos: Vector3
    ) {
        const w = file.file;
        const scale = getContextScale(calc, file.file);
        const localPos = new Vector3().copy(pos).sub(file.position);
        return realPosToGridPos(new Vector2(localPos.x, localPos.z), scale);
    }
}

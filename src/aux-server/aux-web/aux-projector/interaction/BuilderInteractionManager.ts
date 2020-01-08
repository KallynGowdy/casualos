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
    Bot,
    Workspace,
    DEFAULT_WORKSPACE_HEIGHT_INCREMENT,
    DEFAULT_WORKSPACE_MIN_HEIGHT,
    DEFAULT_WORKSPACE_HEIGHT,
    objectsAtWorkspace,
    isMinimized,
    BotCalculationContext,
    getDimensionMinimized,
    getBuilderDimensionGrid,
    getDimensionSize,
    getDimensionScale,
    getDimensionDefaultHeight,
    createBot,
    isDimension,
    getBotConfigDimensions,
    botsInDimension,
    AuxObject,
    toast,
    PartialBot,
    isVisibleDimension,
} from '@casual-simulation/aux-common';
import { BuilderBotClickOperation } from '../../aux-projector/interaction/ClickOperation/BuilderBotClickOperation';
import { Physics } from '../../shared/scene/Physics';
import flatMap from 'lodash/flatMap';
import uniqBy from 'lodash/uniqBy';
import { realPosToGridPos } from '../../shared/scene/hex';
import { Input } from '../../shared/scene/Input';
import { IOperation } from '../../shared/interaction/IOperation';
import { BuilderEmptyClickOperation } from '../../aux-projector/interaction/ClickOperation/BuilderEmptyClickOperation';
import { BuilderNewBotClickOperation } from '../../aux-projector/interaction/ClickOperation/BuilderNewBotClickOperation';
import { AuxBot3D } from '../../shared/scene/AuxBot3D';
import { DimensionGroup3D } from '../../shared/scene/DimensionGroup3D';
import { BuilderGroup3D } from '../../shared/scene/BuilderGroup3D';
import { BaseInteractionManager } from '../../shared/interaction/BaseInteractionManager';
import { GameObject } from '../../shared/scene/GameObject';
import MiniBot from '../../shared/vue-components/MiniBot/MiniBot';
import BotTag from '../../shared/vue-components/BotTag/BotTag';
import BotTable from '../../shared/vue-components/BotTable/BotTable';
import { BrowserSimulation } from '@casual-simulation/aux-vm-browser';
import { BuilderSimulation3D } from '../scene/BuilderSimulation3D';
import { DraggableGroup } from '../../shared/interaction/DraggableGroup';
import BotID from '../../shared/vue-components/BotID/BotID';
import { CameraControls } from '../../shared/interaction/CameraControls';
import {
    Orthographic_MinZoom,
    Orthographic_MaxZoom,
} from '../../shared/scene/CameraRigFactory';
import { CameraRigControls } from '../../shared/interaction/CameraRigControls';
import { BuilderBotIDClickOperation } from './ClickOperation/BuilderBotIDClickOperation';
import { BuilderGame } from '../scene/BuilderGame';
import { BuilderMiniBotClickOperation } from './ClickOperation/BuilderMiniBotClickOperation';
import {
    copyBotsFromSimulation,
    navigateToUrl,
} from '../../shared/SharedUtils';
import { VRController3D } from '../../shared/scene/vr/VRController3D';
import BotTagMini from '../../shared/vue-components/BotTagMini/BotTagMini';
import { BuilderModDragOperation } from './DragOperation/BuilderModDragOperation';
import { BuilderModClickOperation } from './ClickOperation/BuilderModClickOperation';

export class BuilderInteractionManager extends BaseInteractionManager {
    // This overrides the base class Game.
    protected _game: BuilderGame;

    protected _surfaceColliders: DraggableGroup[];
    protected _surfaceObjectsDirty: boolean;

    get selectionMode() {
        return 'single';
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
            gameObject instanceof AuxBot3D ||
            gameObject instanceof DimensionGroup3D
        ) {
            let botClickOp = new BuilderBotClickOperation(
                this._game.simulation3D,
                this,
                gameObject,
                hit,
                vrController
            );
            return botClickOp;
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

        if (
            vueElement instanceof MiniBot &&
            !(vueElement.$parent instanceof BotTagMini)
        ) {
            const bot = vueElement.bot;
            if (vueElement.diffball) {
                return new BuilderModClickOperation(
                    this._game.simulation3D,
                    this,
                    bot.tags,
                    vrController
                );
            }

            return new BuilderMiniBotClickOperation(
                this._game.simulation3D,
                this,
                bot,
                vrController
            );
        } else if (vueElement instanceof BotTag && vueElement.allowCloning) {
            const tag = vueElement.tag;
            const table = vueElement.$parent;
            if (table instanceof BotTable) {
                if (table.bots.length === 1) {
                    const bot = table.bots[0];
                    const mod = {
                        [tag]: bot.tags[tag],
                    };

                    return new BuilderModDragOperation(
                        this._game.simulation3D,
                        this,
                        mod,
                        vrController
                    );
                } else {
                    console.log('not valid');
                }
            } else {
                console.log('Not table');
            }
        } else if (vueElement instanceof BotID) {
            const state = this._game.simulation3D.simulation.helper.botsState;
            const table = vueElement.$parent;

            if (state[vueElement.bots.id]) {
                if (table instanceof BotTable) {
                    return new BuilderBotIDClickOperation(
                        this._game.simulation3D,
                        this,
                        vueElement.bots,
                        vrController,
                        table
                    );
                } else {
                    return new BuilderBotIDClickOperation(
                        this._game.simulation3D,
                        this,
                        vueElement.bots,
                        vrController
                    );
                }
            } else {
                return new BuilderNewBotClickOperation(
                    this._game.simulation3D,
                    this,
                    vueElement.bots,
                    vrController
                );
            }
        } else if (
            vueElement instanceof MiniBot &&
            vueElement.$parent instanceof BotTagMini
        ) {
            const state = this._game.simulation3D.simulation.helper.botsState;
            const table = vueElement.$parent.$parent;
            const bot = vueElement.bot;

            if (vueElement.createMod) {
                return new BuilderModClickOperation(
                    this._game.simulation3D,
                    this,
                    bot.tags,
                    vrController
                );
            }

            if (state[bot.id]) {
                return new BuilderBotIDClickOperation(
                    this._game.simulation3D,
                    this,
                    bot,
                    vrController,
                    table instanceof BotTable ? table : undefined
                );
            }

            if (vueElement.diffball) {
                return new BuilderModClickOperation(
                    this._game.simulation3D,
                    this,
                    bot.tags,
                    vrController
                );
            }

            return new BuilderNewBotClickOperation(
                this._game.simulation3D,
                this,
                bot,
                vrController
            );
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
        } else if (mesh instanceof AuxBot3D) {
            return <BuilderGroup3D>mesh.dimensionGroup;
        } else {
            return this.findWorkspaceForMesh(mesh.parent);
        }
    }

    canShrinkWorkspace(calc: BotCalculationContext, bot: DimensionGroup3D) {
        if (!bot) {
            return false;
        }
        const size = getDimensionSize(calc, bot.bot);
        if (size > 1) {
            if (size === 1) {
                // Can only shrink to zero size if there are no objects on the workspace.
                const allObjects = flatMap(this._game.getSimulations(), s => {
                    return s.dimensions.map(c => c.bot);
                });
                const workspaceObjects = objectsAtWorkspace(
                    allObjects,
                    bot.bot.id
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
     * Determines if we're in the correct mode to manipulate the given bot.
     * @param bot The bot.
     */
    isInCorrectMode(bot: AuxBot3D | DimensionGroup3D) {
        return true;
    }

    /**
     * Raises the tile at the given point by the given amount.
     * @param bot The bot.
     * @param position The tile position.
     * @param height The new height.
     */
    updateTileHeightAtGridPosition(bot: DimensionGroup3D, height: number) {
        let partial: PartialBot = {
            tags: {},
        };

        partial.tags[`auxDimension.surface.grid.0:0`] = height;

        this._game.simulation3D.simulation.helper.updateBot(bot.bot, partial);
    }

    handlePointerEnter(bot: Bot, simulation: BrowserSimulation): void {}

    handlePointerExit(bot: Bot, simulation: BrowserSimulation): void {}

    handlePointerDown(bot: Bot, simulation: BrowserSimulation): void {}

    handlePointerUp(bot: Bot, simulation: BrowserSimulation): void {}

    /**
     * Calculates the grid location and workspace that the given page position intersects with.
     * @param input The input to find the grid position under. This can be either a Vector2 page position (Browser) or a ray (VR).
     */
    pointOnWorkspaceGrid(calc: BotCalculationContext, input: Vector2 | Ray) {
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
                    isDimension(calc, workspace.bot) &&
                    !getDimensionMinimized(calc, workspace.bot)
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
     * Gets the first dimension that the given workspace has.
     */
    firstDimensionInWorkspace(workspace: DimensionGroup3D): string {
        const dimensions = [...workspace.dimensions.keys()];
        if (dimensions.length > 0) {
            return dimensions[0];
        }
        return null;
    }

    getSurfaceObjectGroups(calc: BotCalculationContext): DraggableGroup[] {
        if (this._surfaceObjectsDirty) {
            const builderSimulations = this._game
                .getSimulations()
                .filter(s => s instanceof BuilderSimulation3D);

            const builderDimensions = flatMap(
                builderSimulations,
                s => s.dimensions
            ).filter(c => isDimension(calc, c.bot));

            const builderActiveDimensions = builderDimensions.filter(c =>
                isVisibleDimension(calc, c.bot)
            );

            const surfaceObjects = flatMap(
                builderActiveDimensions,
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
        calc: BotCalculationContext,
        gameObject: GameObject,
        point: Vector3
    ): ContextMenuAction[] {
        let actions: ContextMenuAction[] = [];

        if (gameObject) {
            if (
                gameObject instanceof DimensionGroup3D &&
                isDimension(calc, gameObject.bot)
            ) {
                const tile = this._worldPosToGridPos(calc, gameObject, point);
                const currentGrid = getBuilderDimensionGrid(
                    calc,
                    gameObject.bot
                );
                const currentTile = currentGrid ? currentGrid['0:0'] : null;
                const defaultHeight = getDimensionDefaultHeight(
                    calc,
                    gameObject.bot
                );
                let currentHeight =
                    (!!currentGrid ? currentGrid['0:0'] : defaultHeight) ||
                    DEFAULT_WORKSPACE_HEIGHT;
                const increment = DEFAULT_WORKSPACE_HEIGHT_INCREMENT; // TODO: Replace with a configurable value.
                const minHeight = DEFAULT_WORKSPACE_MIN_HEIGHT; // TODO: This too
                const minimized = isMinimized(calc, gameObject.bot);

                const minimizedLabel = minimized ? 'Maximize' : 'Minimize';
                actions.push({
                    label: minimizedLabel,
                    onClick: () => this._toggleWorkspace(calc, gameObject),
                });

                actions.push({
                    label: 'Go to Dimension',
                    onClick: () => this._switchToPlayer(calc, gameObject),
                });

                actions.push({
                    label: 'Edit Bot',
                    onClick: () => this._selectDimensionBot(calc, gameObject),
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
            }
        }

        return actions;
    }

    private _shrinkWorkspace(
        calc: BotCalculationContext,
        bot: DimensionGroup3D
    ) {
        if (bot && isDimension(calc, bot.bot)) {
            const size = getDimensionSize(calc, bot.bot);
            this._game.simulation3D.simulation.helper.updateBot(bot.bot, {
                tags: {
                    [`auxDimensionSurfaceSize`]: (size || 0) - 1,
                },
            });
        }
    }

    /**
     * On raise or lower, set all hexes in workspace to given height
     * @param bot
     */
    private _setAllHexHeight(
        calc: BotCalculationContext,
        gameObject: DimensionGroup3D,
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
     * @param bot
     */
    private _toggleWorkspace(
        calc: BotCalculationContext,
        bot: DimensionGroup3D
    ) {
        if (bot && isDimension(calc, bot.bot)) {
            const minimized = !isMinimized(calc, bot.bot);
            this._game.simulation3D.simulation.helper.updateBot(bot.bot, {
                tags: {
                    [`auxDimensionSurfaceMinimized`]: minimized,
                },
            });
        }
    }

    /**
     * Copies all the bots on the workspace to the given user's clipboard.
     * @param bot
     */
    private async _copyWorkspace(
        calc: BotCalculationContext,
        bot: DimensionGroup3D
    ) {
        if (bot && isDimension(calc, bot.bot)) {
            const dimensions = getBotConfigDimensions(calc, bot.bot);
            let bots = flatMap(dimensions, c => botsInDimension(calc, c));

            // add in the dimension bot to the workspace copy
            bots.unshift(bot.bot);

            const deduped = uniqBy(bots, f => f.id);

            await copyBotsFromSimulation(bot.simulation3D.simulation, <
                AuxObject[]
            >deduped);

            await bot.simulation3D.simulation.helper.transaction(
                toast('Worksurface Copied!')
            );
        }
    }

    private _expandWorkspace(
        calc: BotCalculationContext,
        bot: DimensionGroup3D
    ) {
        if (bot) {
            const size = getDimensionSize(calc, bot.bot);
            this._game.simulation3D.simulation.helper.updateBot(bot.bot, {
                tags: {
                    [`auxDimensionSurfaceSize`]: (size || 0) + 1,
                },
            });
        }
    }

    private _selectDimensionBot(
        calc: BotCalculationContext,
        bot: DimensionGroup3D
    ) {}

    private _switchToPlayer(
        calc: BotCalculationContext,
        bot: DimensionGroup3D
    ) {
        let dimensions = getBotConfigDimensions(calc, bot.bot);
        let dimension = dimensions[0];

        // https://auxbuilder.com/
        //   ^     |     host    |     path           |
        // simulationId: ''
        const simulationId = window.location.pathname.split('/')[2];

        const url = new URL(
            `/${dimension}/${simulationId || 'default'}`,
            window.location.href
        );

        // open in new tab
        navigateToUrl(url.toString(), '_blank', 'noreferrer');
    }

    private _worldPosToGridPos(
        calc: BotCalculationContext,
        bot: DimensionGroup3D,
        pos: Vector3
    ) {
        const w = bot.bot;
        const scale = getDimensionScale(calc, bot.bot);
        const localPos = new Vector3().copy(pos).sub(bot.position);
        return realPosToGridPos(new Vector2(localPos.x, localPos.z), scale);
    }
}

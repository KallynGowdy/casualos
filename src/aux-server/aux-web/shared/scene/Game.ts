import {
    Scene,
    WebGLRenderer,
    Color,
    Texture,
    Vector3,
    Vector2,
    sRGBEncoding,
} from '@casual-simulation/three';
import { IGameView } from '../vue-components/IGameView';
import { ArgEvent } from '@casual-simulation/aux-common/Events';
import {
    Bot,
    DEFAULT_SCENE_BACKGROUND_COLOR,
    hasValue,
    FocusOnBotAction,
    FocusOnOptions,
    DEFAULT_WORKSPACE_GRID_SCALE,
    BotCursorType,
    getPortalTag,
    asyncResult,
    asyncError,
} from '@casual-simulation/aux-common';
import {
    CameraRig,
    CameraType,
    resizeCameraRig,
    createCameraRig,
} from './CameraRigFactory';
import { Time } from './Time';
import { Input, InputType, ControllerData } from './Input';
import { BaseInteractionManager } from '../interaction/BaseInteractionManager';
import { Viewport } from './Viewport';
import { HtmlMixer } from './HtmlMixer';
import { GridChecker } from './grid/GridChecker';
import { Simulation3D } from './Simulation3D';
import { AuxBotVisualizer } from './AuxBotVisualizer';
import { SubscriptionLike, Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TweenCameraToOperation } from '../interaction/TweenCameraToOperation';
import { baseAuxAmbientLight, baseAuxDirectionalLight } from './SceneUtils';
import { createHtmlMixerContext, disposeHtmlMixerContext } from './HtmlUtils';
import { flatMap, merge, union } from 'lodash';
import { EventBus } from '../EventBus';
import { AuxBotVisualizerFinder } from '../AuxBotVisualizerFinder';
import { DebugObjectManager } from './debugobjectmanager/DebugObjectManager';
import { AuxBot3D } from './AuxBot3D';
import { Simulation } from '@casual-simulation/aux-vm';
import { convertCasualOSPositionToThreePosition } from './grid/Grid';
import { FocusCameraRigOnOperation } from '../interaction/FocusCameraRigOnOperation';

export const PREFERRED_XR_REFERENCE_SPACE = 'local-floor';

/**
 * The Game class is the root of all Three Js activity for the current AUX session.
 * It houses all the core systems for interacting with AUX Web, such as rendering 3d elements to the canvas,
 * handling input, tracking time, and enabling VR and AR.
 */
export abstract class Game {
    /**
     * The game view component that this game is parented to.
     */
    gameView: IGameView;

    protected mainScene: Scene;
    protected renderer: WebGLRenderer;
    protected time: Time;
    protected input: Input;
    protected interaction: BaseInteractionManager;
    protected gridChecker: GridChecker;
    protected htmlMixerContext: HtmlMixer.Context;
    protected currentCameraType: CameraType;
    protected subs: SubscriptionLike[];
    protected disposed: boolean = false;

    mainCameraRig: CameraRig = null;
    mainViewport: Viewport = null;
    showMainCameraHome: boolean;

    /**
     * The WebXR session that is currently active.
     * Null if no XR session is active.
     */
    xrSession: any = null;
    xrMode: 'immersive-ar' | 'immersive-vr' = null;

    onBotAdded: ArgEvent<Bot> = new ArgEvent<Bot>();
    onBotUpdated: ArgEvent<Bot> = new ArgEvent<Bot>();
    onBotRemoved: ArgEvent<Bot> = new ArgEvent<Bot>();
    onCameraRigTypeChanged: ArgEvent<CameraRig> = new ArgEvent<CameraRig>();

    /**
     * The cursor value that should be used to override the background cursor value.
     */
    botCursor: BotCursorType;

    /**
     * The cursor value that should be used as the default cursor when none is available.
     */
    backgroundCursor: BotCursorType;

    /**
     * The cursor value that is currently used.
     */
    get cursor(): BotCursorType {
        return this.botCursor || this.backgroundCursor;
    }

    private _isPOV: boolean = false;

    /**
     * Gets whether the game is currently in an immersive viewing mode.
     * Generally, this means VR or AR but it can also be POV mode.
     */
    get isImmersive() {
        return !!this.xrSession || this._isPOV;
    }

    private _onUpdate: Subject<void> = new Subject<void>();

    constructor(gameView: IGameView) {
        this.gameView = gameView;

        if (hasValue(window)) {
            merge((<any>window).aux || {}, {
                getGame: () => this,
            });
        }
    }

    async setup() {
        console.log('[Game] Setup');
        this.onBotAdded.invoke = this.onBotAdded.invoke.bind(this.onBotAdded);
        this.onBotRemoved.invoke = this.onBotRemoved.invoke.bind(
            this.onBotRemoved
        );
        this.onBotUpdated.invoke = this.onBotUpdated.invoke.bind(
            this.onBotUpdated
        );

        DebugObjectManager.init();

        this.time = new Time();
        this.subs = [];
        this.setupRendering();
        this.setupScenes();
        this.input = new Input(this);
        this.input.controllerAdded.subscribe(
            (controller) => this.handleControllerAdded(controller),
            (err) => console.error(err)
        );
        this.input.controllerRemoved.subscribe(
            (controller) => this.handleControllerRemoved(controller),
            (err) => console.error(err)
        );
        this.interaction = this.setupInteraction();

        this.onCenterCamera = this.onCenterCamera.bind(this);
        this.setCameraType = this.setCameraType.bind(this);

        EventBus.$on('centerCamera', this.onCenterCamera);
        EventBus.$on('changeCameraType', this.setCameraType);

        await this.onBeforeSetupComplete();

        this.frameUpdate = this.frameUpdate.bind(this);
        this.startBrowserAnimationLoop();
    }

    protected startBrowserAnimationLoop() {
        this.renderer.setAnimationLoop(this.frameUpdate);
    }

    protected stopBrowserAnimationLoop() {
        this.renderer.setAnimationLoop(null);
    }

    protected async onBeforeSetupComplete() {}

    dispose(): void {
        if (this.disposed) {
            return;
        }
        console.log('[Game] Dispose');
        this.disposed = true;

        this.stopBrowserAnimationLoop();
        disposeHtmlMixerContext(this.htmlMixerContext, this.gameView.gameView);
        this.removeSidebarItem('enable_xr');
        this.removeSidebarItem('disable_xr');
        this.input.dispose();

        if (this.subs) {
            this.subs.forEach((sub) => {
                sub.unsubscribe();
            });
            this.subs = [];
        }

        EventBus.$off('changeCameraType', this.setCameraType);
    }

    getTime() {
        return this.time;
    }
    getInput() {
        return this.input;
    }
    getInteraction() {
        return this.interaction;
    }
    getScene() {
        return this.mainScene;
    }
    getRenderer() {
        return this.renderer;
    }
    getMainCameraRig(): CameraRig {
        return this.mainCameraRig;
    }
    getMainViewport(): Viewport {
        return this.mainViewport;
    }
    getHtmlMixerContext(): HtmlMixer.Context {
        return this.htmlMixerContext;
    }
    getGridChecker(): GridChecker {
        return this.gridChecker;
    }

    abstract getBackground(): Color | Texture;

    abstract getBackgroundAddress(): string;

    /**
     * Get all of the current viewports.
     */
    abstract getViewports(): Viewport[];

    /**
     * Get all of the current camera rigs.
     */
    abstract getCameraRigs(): CameraRig[];

    /**
     * Gets the list of simulations that this game view contains.
     */
    abstract getSimulations(): Simulation3D[];

    /**
     * Gets the HTML elements that the interaction manager should be able to handle events for.
     */
    abstract getUIHtmlElements(): HTMLElement[];

    /**
     * Finds the list of bot visualizers for the given bot ID.
     * First tries to match bots that have an exact match to the given ID.
     * If no bots are found, then it will search again but this time searching for bots
     * that have IDs that start with the given ID.
     * @param id The ID of the bot to find.
     */
    abstract findAllBotsById(id: string): AuxBotVisualizer[];

    /**
     * Sets the visibility of the bot grids.
     */
    abstract setGridsVisible(visible: boolean): void;

    /**
     * Sets the visibility of the world grid.
     * @param visible Whether the grid is visible.
     */
    abstract setWorldGridVisible(visible: boolean): void;

    abstract setupInteraction(): BaseInteractionManager;

    /**
     * Adds a new sidebar item to the sidebar.
     * @param id
     * @param text
     * @param click
     */
    abstract addSidebarItem(
        id: string,
        text: string,
        click: () => void,
        icon?: string,
        group?: string
    ): void;

    /**
     * Removes the sidebar item with the given ID.
     * @param id
     */
    abstract removeSidebarItem(id: string): void;

    /**
     * Removes all the sidebar items with the given group.
     * @param id
     */
    abstract removeSidebarGroup(group: string): void;

    onWindowResize(width: number, height: number): void {
        this.mainViewport.setSize(width, height);

        // Resize html view and the webgl renderer.
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height);

        // Resize html mixer css3d renderer.
        if (this.htmlMixerContext) {
            this.htmlMixerContext.rendererCss.setSize(width, height);
        }

        // Resize cameras.
        if (this.mainCameraRig) {
            resizeCameraRig(this.mainCameraRig);
        }
    }

    setCameraType(type: CameraType) {
        if (this.currentCameraType === type) return;

        // Clean up current cameras if they exists.
        if (this.mainCameraRig) {
            this.mainScene.remove(this.mainCameraRig.mainCamera);
            this.mainCameraRig = null;
        }

        this.currentCameraType = type;

        this.mainCameraRig = createCameraRig(
            'main',
            this.currentCameraType,
            this.mainScene,
            this.mainViewport
        );

        if (this.htmlMixerContext) {
            this.htmlMixerContext.setupCssCamera(this.mainCameraRig.mainCamera);
        }

        this.onCameraRigTypeChanged.invoke(this.mainCameraRig);
    }

    onCenterCamera(cameraRig: CameraRig): void {
        if (!cameraRig) return;

        let controls = this.interaction.cameraRigControllers.find(
            (c) => c.rig.name === cameraRig.name
        );

        // if (cameraRig.name != 'main') {
        //     controls.controls.resetRot = true;
        //     controls.controls.update();
        // }

        this.tweenCameraToPosition(
            cameraRig,
            new Vector3(0, 0, 0),
            { duration: 1, easing: 'quadratic' },
            null,
            null
        );
    }

    /**
     * Tweens the camera to view the bot.
     * @param cameraRig The camera rig to tween.
     * @param action The action to use for tweening.
     */
    tweenCameraToBot(action: FocusOnBotAction) {
        // find the bot with the given ID
        const matches = this.findAllBotsById(action.botId);
        console.log(
            this.constructor.name,
            'tweenCameraToBot matching bots:',
            matches
        );
        if (matches.length > 0) {
            const bots = matches.filter(
                (b) =>
                    b instanceof AuxBot3D &&
                    this._shouldHandleFocus(
                        action,
                        b.dimensionGroup.simulation3D.portalTags
                    )
            ) as AuxBot3D[];

            if (bots.length > 0) {
                let animatingCameraRigs = new Set<CameraRig>();

                for (let bot of bots) {
                    const rig = bot.dimensionGroup.simulation3D.getMainCameraRig();
                    if (animatingCameraRigs.has(rig)) {
                        continue;
                    }
                    animatingCameraRigs.add(rig);

                    const targetPosition = new Vector3();
                    bot.display.getWorldPosition(targetPosition);

                    this.tweenCameraToPosition(
                        rig,
                        targetPosition,
                        action,
                        bot.dimensionGroup.simulation3D.simulation,
                        action.taskId
                    );
                }
            }
        }
    }

    private _shouldHandleFocus(
        options: FocusOnOptions,
        possiblePortals: string[]
    ) {
        if (hasValue(options.portal)) {
            const targetPortal = getPortalTag(options.portal);
            if (possiblePortals.every((p) => p !== targetPortal)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Animates the main camera to view the given position.
     * @param cameraRig The camera rig to tween.
     * @param position The position to animate to.
     * @param zoomValue The zoom value to use.
     */
    tweenCameraToPosition(
        cameraRig: CameraRig,
        position: Vector3,
        options: FocusOnOptions,
        simulation: Simulation,
        taskId: string | number
    ) {
        const portalTags = union(
            ...this.getSimulations().map((sim) => sim.portalTags)
        );
        if (!this._shouldHandleFocus(options, portalTags)) {
            return;
        }

        // Cancel the operations for the same camera rig
        this.interaction.clearOperations(
            (op) =>
                (op instanceof TweenCameraToOperation ||
                    op instanceof FocusCameraRigOnOperation) &&
                op.cameraRig === cameraRig
        );

        if (cameraRig.cancelFocus && cameraRig.focusOnPosition) {
            this.interaction.addOperation(
                new FocusCameraRigOnOperation(
                    cameraRig,
                    this.time,
                    this.interaction,
                    position,
                    options,
                    simulation,
                    taskId
                ),
                false
            );
        } else {
            this.interaction.addOperation(
                new TweenCameraToOperation(
                    cameraRig,
                    this.time,
                    this.interaction,
                    position,
                    options,
                    simulation,
                    taskId
                ),
                false
            );
        }
    }

    /**
     * Instantly sets the main camera to the given position.
     * @param cameraRig The camera rig to tween.
     * @param position The position to animate to.
     * @param zoomValue The zoom value to use.
     */
    setCameraToPosition(
        cameraRig: CameraRig,
        position: Vector3,
        zoomValue?: number,
        rotationValue?: Vector2
    ) {
        // Cancel the operations for the same camera rig
        this.interaction.clearOperations(
            (op) =>
                (op instanceof TweenCameraToOperation ||
                    op instanceof FocusCameraRigOnOperation) &&
                op.cameraRig === cameraRig
        );
        const options = {
            zoom: zoomValue,
            rotation: rotationValue,
            duration: 0,
        };
        if (cameraRig.cancelFocus && cameraRig.focusOnPosition) {
            this.interaction.addOperation(
                new FocusCameraRigOnOperation(
                    cameraRig,
                    this.time,
                    this.interaction,
                    position,
                    options,
                    null,
                    null
                ),
                false
            );
        } else {
            this.interaction.addOperation(
                new TweenCameraToOperation(
                    cameraRig,
                    this.time,
                    this.interaction,
                    position,
                    options,
                    null,
                    null
                ),
                false
            );
        }
    }

    /**
     * Finds the first simulation that is using the given camera rig as its primary rig.
     * @param rig The camera rig.
     */
    findSimulationForCameraRig(rig: CameraRig) {
        return this.getSimulations().find(
            (sim) => sim.getMainCameraRig() === rig
        );
    }

    protected mainSceneBackgroundUpdate() {
        const address = this.getBackgroundAddress();
        if (address && !this.xrSession) {
            this.mainScene.background = null;
            this.renderer.setClearColor('#fff', 0);
            this.renderer.autoClear = true;
            this.gameView.gameView.style.background = `url(${address}) no-repeat center center`;
            this.gameView.gameView.style.backgroundSize = 'cover';
        } else {
            const background = this.getBackground();
            delete this.gameView.gameView.style.background;
            delete this.gameView.gameView.style.backgroundSize;
            this.renderer.autoClear = false;
            if (background) {
                this.mainScene.background = background;
            } else {
                this.mainScene.background = new Color(
                    DEFAULT_SCENE_BACKGROUND_COLOR
                );
            }
        }
    }

    protected setupRenderer() {
        const webGlRenderer = (this.renderer = new WebGLRenderer({
            antialias: true,

            // Alpha is required for CSS Renderer (HTML support)
            alpha: true,
        }));
        webGlRenderer.autoClear = false;
        webGlRenderer.shadowMap.enabled = false;
        this.renderer.outputEncoding = sRGBEncoding;
        this.gameView.gameView.appendChild(this.renderer.domElement);
    }

    protected setupRendering() {
        this.setupRenderer();

        this.mainViewport = new Viewport('main', null, this.gameView.container);
        this.mainViewport.layer = 0;
    }

    protected setupScenes() {
        //
        // [Main scene]
        //
        this.mainScene = new Scene();
        this.mainScene.autoUpdate = false;

        // Main scene camera.
        this.setCameraType('orthographic');

        // Main scene ambient light.
        const ambient = baseAuxAmbientLight();
        this.mainScene.add(ambient);

        // Main scene directional light.
        const directional = baseAuxDirectionalLight();
        this.mainScene.add(directional);

        //
        // [Html Mixer Context]
        //
        this.htmlMixerContext = createHtmlMixerContext(
            this.renderer,
            this.mainCameraRig.mainCamera,
            this.gameView.gameView
        );
    }

    protected frameUpdate(xrFrame?: any) {
        DebugObjectManager.update();

        this.input.update(xrFrame);
        this.updateInteraction();

        const simulations = this.getSimulations();
        if (simulations) {
            for (let i = 0; i < simulations.length; i++) {
                simulations[i].frameUpdate();
            }
        }

        if (this.htmlMixerContext) {
            this.htmlMixerContext.update();
        }

        this.renderUpdate(xrFrame);
        this.time.update();

        if (this.xrSession) {
            this.xrSession.requestAnimationFrame(
                (time: any, nextXRFrame: any) => this.frameUpdate(nextXRFrame)
            );
        }

        this.renderCursor();
        this.input.resetEvents();

        this._onUpdate.next();
    }

    protected updateInteraction() {
        this.interaction.update();
    }

    protected renderCursor() {
        this.gameView.setCursor(this.cursor);
    }

    protected renderUpdate(xrFrame?: any) {
        if (this.xrSession && xrFrame) {
            if (this.xrMode === 'immersive-ar') {
                this.mainScene.background = null;
                this.renderer.setClearColor('#000', 0);
            }
            this.renderXR();
        } else {
            this.renderBrowser();
        }
    }

    /**
     * Render the current frame for the default browser mode.
     */
    protected renderBrowser() {
        //
        // [Main scene]
        //

        this.renderer.setSize(
            this.mainViewport.width,
            this.mainViewport.height
        );

        this.renderMainViewport(true);
    }

    /**
     * Renders the main camera to the main viewport.
     * @param renderBackground Whether to render the background color.
     */
    protected renderMainViewport(renderBackground: boolean) {
        this.mainCameraRig.mainCamera.updateMatrixWorld(true);

        this.renderer.setScissorTest(false);

        // Render the main scene with the main camera.
        this.renderer.clear();
        if (renderBackground) {
            this.mainSceneBackgroundUpdate();
        }
        this.renderer.render(this.mainScene, this.mainCameraRig.mainCamera);

        // Render debug object manager if it's enabled.
        if (DebugObjectManager.enabled) {
            DebugObjectManager.render(
                this.renderer,
                this.mainCameraRig.mainCamera
            );
        }
    }

    /**
     * Render the current frame for XR (AR mode).
     */
    protected renderXR() {
        //
        // [Main scene]
        //
        this.renderMainViewport(false);
    }

    /**
     * Render the current frame for VR.
     */
    protected renderVR() {
        //
        // [Main scene]
        //
        this.renderMainViewport(true);
    }

    watchCameraRigDistanceSquared(cameraRig: CameraRig): Observable<number> {
        let rigControls = this.interaction.cameraRigControllers.find(
            (rigControls) => rigControls.rig === cameraRig
        );

        return this._onUpdate.pipe(
            map(() => {
                const target = rigControls.controls.target.clone();
                return target.distanceToSquared(new Vector3(0, 0, 0));
            })
        );
    }

    protected async stopAR() {
        this.stopXR();
    }

    protected async startAR() {
        this.startXR('immersive-ar');
    }

    protected async stopXR(ending: boolean = false) {
        if (!this.xrSession) {
            console.log('[Game] XR already stopped!');
            return;
        }
        console.log('[Game] Stop XR');
        if (!ending) {
            await this.xrSession.end();
        }
        this.xrSession = null;

        // Restart the regular animation update loop.
        this.renderer.xr.enabled = false;
        this.renderer.setAnimationLoop(this.frameUpdate);
        // Go back to the orthographic camera type when exiting XR.
        this.setCameraType('orthographic');
        this.input.currentInputType = InputType.Undefined;
    }

    protected async startXR(mode: 'immersive-ar' | 'immersive-vr') {
        // if (!this.xrDisplay) {
        //     return;
        // }
        if (this.xrSession) {
            console.log('[Game] XR already started!');
            return;
        }
        console.log('[Game] Start XR');
        const nav: any = navigator;
        let supportsPreferredReferenceSpace = true;
        this.xrSession = await nav.xr
            .requestSession(mode, {
                requiredFeatures: [PREFERRED_XR_REFERENCE_SPACE],
            })
            .catch((err: any) => {
                supportsPreferredReferenceSpace = false;
                return nav.xr.requestSession(mode);
            });
        this.xrMode = mode;

        const referenceSpaceType = supportsPreferredReferenceSpace
            ? PREFERRED_XR_REFERENCE_SPACE
            : 'local';
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType(referenceSpaceType);
        this.renderer.xr.setSession(this.xrSession);
        // XR requires that we be using a perspective camera.
        this.setCameraType('perspective');
        // Remove the camera toggle from the menu while in XR.
        this.removeSidebarItem('toggle_camera_type');
        document.documentElement.classList.add('ar-app');

        const referenceSpace = await this.xrSession.requestReferenceSpace(
            referenceSpaceType
        );
        this.input.setXRSession(this.xrSession, referenceSpace);

        this.xrSession.addEventListener('end', (ev: any) =>
            this.handleXRSessionEnded()
        );

        const win = <any>window;
        if (this.xrSession === null) {
            throw new Error('Cannot start presenting without a xrSession');
        }

        // Stop regular animation update loop and use the one from the xr session.
        this.stopBrowserAnimationLoop();
        this.xrSession.requestAnimationFrame((time: any, nextXRFrame: any) =>
            this.frameUpdate(nextXRFrame)
        );
    }

    protected startPOV(center: { x: number; y: number; z: number }) {
        if (this._isPOV) {
            console.log('[Game] POV already started!');
            return;
        }
        console.log('[Game] Start POV');

        this._isPOV = true;

        // POV requires that we be using a perspective camera.
        this.setCameraType('perspective');

        // Remove the camera toggle from the menu while in XR.
        this.removeSidebarItem('toggle_camera_type');

        document.documentElement.classList.add('pov-app');

        if (center) {
            const sims = this.getSimulations();
            const gridScale =
                sims.length > 0
                    ? sims[0].getDefaultGridScale()
                    : DEFAULT_WORKSPACE_GRID_SCALE;
            this.mainCameraRig.cameraParent.position.copy(
                convertCasualOSPositionToThreePosition(
                    center.x,
                    center.y,
                    center.z,
                    gridScale
                )
            );
            this.mainCameraRig.mainCamera.position.set(0, 0, 0);
            this.mainCameraRig.mainCamera.rotation.set(0, 0, 0);
            this.mainCameraRig.cameraParent.updateMatrixWorld(true);
            this.mainCameraRig.mainCamera.updateMatrixWorld(true);
        }
    }

    protected stopPOV() {
        if (!this._isPOV) {
            console.log('[Game] POV already stopped!');
            return;
        }
        console.log('[Game] Stop POV');

        this._isPOV = false;

        // Go back to the orthographic camera type when exiting XR.
        this.setCameraType('orthographic');

        document.documentElement.classList.remove('pov-app');
        this.mainCameraRig.cameraParent.position.set(0, 0, 0);
    }

    protected handleXRSessionEnded() {
        console.log('[Game] handleXRSessionEnded');
        this.stopXR(true);
    }

    protected stopVR() {
        this.stopXR();
    }

    protected startVR() {
        this.startXR('immersive-vr');
    }

    protected handleControllerAdded(controller: ControllerData): void {
        console.log('[Game] Controller added', controller);
    }

    protected handleControllerRemoved(controller: ControllerData): void {
        console.log('[Game] Controller removed', controller);
    }
}

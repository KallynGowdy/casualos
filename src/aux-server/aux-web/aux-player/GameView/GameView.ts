import {
    Scene,
    Color,
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    Math as ThreeMath,
    PCFSoftShadowMap,
    HemisphereLight,
    Plane,
    Vector3,
    Quaternion,
    Matrix4,
    Texture,
} from 'three';

import VRControlsModule from 'three-vrcontrols-module';
import VREffectModule from 'three-vreffect-module';
import * as webvrui from 'webvr-ui';

import Vue from 'vue';
import Component from 'vue-class-component';
import { Inject, Provide, Prop } from 'vue-property-decorator';
import {
    SubscriptionLike
} from 'rxjs';
import {
    concatMap, tap,
    flatMap as rxFlatMap
} from 'rxjs/operators';

import {
    Object,
    DEFAULT_SCENE_BACKGROUND_COLOR,
    AuxFile,
    AuxObject,
    isDestroyed
} from '@yeti-cgi/aux-common';
import { ArgEvent } from '@yeti-cgi/aux-common/Events';
import { Time } from '../../shared/scene/Time';
import { Input, InputType } from '../../shared/scene/Input';
import { InputVR } from '../../shared/scene/InputVR';
import { appManager } from '../../shared/AppManager';
import { find, flatMap } from 'lodash';
import App from '../App/App';
import { FileRenderer } from '../../shared/scene/FileRenderer';
import { IGameView } from '../../shared/IGameView';
import { LayersHelper } from '../../shared/scene/LayersHelper';
import { ContextGroup3D } from '../../shared/scene/ContextGroup3D';
import { AuxFile3D } from '../../shared/scene/AuxFile3D';
import { DebugObjectManager } from '../../shared/scene/DebugObjectManager';
import { AuxFile3DDecoratorFactory } from '../../shared/scene/decorators/AuxFile3DDecoratorFactory';
import { PlayerInteractionManager } from '../interaction/PlayerInteractionManager';
import InventoryFile from '../InventoryFile/InventoryFile';
import { InventoryContext } from '../InventoryContext';
import { doesFileDefinePlayerContext } from '../PlayerUtils';

@Component({
    components: {
        'inventory-file': InventoryFile
    }
})
export default class GameView extends Vue implements IGameView {
    private _scene: Scene;
    private _mainCamera: PerspectiveCamera;
    private _uiWorldCamera: PerspectiveCamera;
    private _renderer: WebGLRenderer;

    private _enterVr: any;
    private _vrControls: any;
    private _vrEffect: any;

    private _sun: DirectionalLight;
    private _ambient: AmbientLight;
    private _skylight: HemisphereLight;

    private _groundPlane: Plane;
    private _canvas: HTMLCanvasElement;
    private _time: Time;
    private _input: Input;
    private _inputVR: InputVR;
    private _interaction: PlayerInteractionManager;
    private _originalBackground: Color | Texture;

    public onFileAdded: ArgEvent<AuxFile> = new ArgEvent<AuxFile>();
    public onFileUpdated: ArgEvent<AuxFile> = new ArgEvent<AuxFile>();
    public onFileRemoved: ArgEvent<AuxFile> = new ArgEvent<AuxFile>();

    /**
     * Keep files in a back buffer so that we can add files to contexts when they come in.
     * We should not guarantee that contexts will come first so we must have some lazy file adding.
     */
    private _fileBackBuffer: Map<string, AuxObject>;

    /**
     * The current context group 3d that the AUX Player is rendering.
     */
    private _contextGroup: ContextGroup3D;

    private _fileSubs: SubscriptionLike[];
    private _decoratorFactory: AuxFile3DDecoratorFactory;

    xrCapable: boolean = false;
    xrDisplay: any = null;
    xrSession: any = null;
    xrSessionInitParameters: any = null;
    vrDisplay: VRDisplay = null;
    vrCapable: boolean = false;

    inventoryContext: InventoryContext = null;

    @Inject() addSidebarItem: App['addSidebarItem'];
    @Inject() removeSidebarItem: App['removeSidebarItem'];
    @Prop() context: string;

    @Provide() fileRenderer: FileRenderer = new FileRenderer();

    getUIHtmlElements(): HTMLElement[] { return [<HTMLElement>this.$refs.inventory]; }
    get gameView(): HTMLElement { return <HTMLElement>this.$refs.gameView; }
    get canvas() { return this._canvas; }
    get time(): Time { return this._time; }
    get input(): Input { return this._input; }
    get inputVR(): InputVR { return this._inputVR; }
    get mainCamera(): PerspectiveCamera { return this._mainCamera; }
    get scene(): Scene { return this._scene; }
    get renderer(): WebGLRenderer { return this._renderer; }
    get dev(): boolean { return !PRODUCTION; }
    get filesMode(): boolean { console.error("AUX Player does not implement filesMode."); return false; }
    get workspacesMode(): boolean { console.error("AUX Player does not implement workspacesMode."); return false; }
    get groundPlane(): Plane { return this._groundPlane; }
    get fileManager() { return appManager.fileManager; }

    constructor() {
        super();
    }

    public findFilesById(id: string): AuxFile3D[] {
        return flatMap(this._contextGroup.getFiles().filter(f => f.file.id === id));
    }

    public getContexts(): ContextGroup3D[] {
        return [this._contextGroup];
    }

    public setGridsVisible(visible: boolean) {
        // This currently does nothing for AUX Player, we dont really show any grids right now.
    }

    public async mounted() {
        this._handleResize = this._handleResize.bind(this);
        window.addEventListener('resize', this._handleResize);
        window.addEventListener('vrdisplaypresentchange', this._handleResize);

        this._time = new Time();
        this._fileSubs = [];
        this._fileBackBuffer = new Map<string, AuxObject>();
        this._decoratorFactory = new AuxFile3DDecoratorFactory(this);
        this._setupScene();
        DebugObjectManager.init(this._time, this._scene);
        this._input = new Input(this);
        this._inputVR = new InputVR(this);
        this._interaction = new PlayerInteractionManager(this);

        this._setupWebVR();
        await this._setupWebXR();
        this._triggerFilesRefresh();
        this._frameUpdate();
    }

    public beforeDestroy() {
        window.removeEventListener('resize', this._handleResize);
        window.removeEventListener('vrdisplaypresentchange', this._handleResize);
        this.removeSidebarItem('enable_xr');
        this.removeSidebarItem('disable_xr');
        this.removeSidebarItem('debug_mode');
        this._input.dispose();

        if (this._fileSubs) {
            this._fileSubs.forEach(sub => {
                sub.unsubscribe();
            });
            this._fileSubs = [];
        }
    }

    private _frameUpdate(xrFrame?: any) {

        DebugObjectManager.update();

        let calc = this.fileManager.createContext();

        this._input.update();
        this._inputVR.update();
        this._interaction.update();

        if (this._contextGroup) {
            this._contextGroup.frameUpdate(calc);
        }

        if (this.inventoryContext) {
            this.inventoryContext.frameUpdate(calc);
        }

        this._renderUpdate(xrFrame);
        this._time.update();

        if (this.vrDisplay && this.vrDisplay.isPresenting) {
            this.vrDisplay.requestAnimationFrame(() => this._frameUpdate());
        } else if (this.xrSession) {
            this.xrSession.requestFrame((nextXRFrame: any) => this._frameUpdate(nextXRFrame));
        } else {
            requestAnimationFrame(() => this._frameUpdate());
        }

    }

    private _renderUpdate(xrFrame?: any) {

        if (this.vrDisplay && this.vrDisplay.isPresenting) {

            this._vrControls.update();
            this._renderCore();
            this._vrEffect.render(this._scene, this._mainCamera);

        } else if (this.xrSession && xrFrame) {

            // Update XR stuff
            if (this._scene.background !== null) {
                this._originalBackground = this._scene.background.clone();
            }
            this._scene.background = null;
            this._renderer.setSize(this.xrSession.baseLayer.framebufferWidth, this.xrSession.baseLayer.framebufferHeight, false)
            this._renderer.setClearColor('#000', 0);

            this._mainCamera.matrixAutoUpdate = false;

            for (const view of xrFrame.views) {
                // Each XRView has its own projection matrix, so set the _camera to use that
                let matrix = new Matrix4();
                matrix.fromArray(view.viewMatrix);

                let position = new Vector3();
                position.setFromMatrixPosition(matrix);
                position.multiplyScalar(10);

                // Move the player up about a foot above the world.
                position.add(new Vector3(0, 2, 3));
                this._mainCamera.position.copy(position);

                let rotation = new Quaternion();
                rotation.setFromRotationMatrix(matrix);
                this._mainCamera.setRotationFromQuaternion(rotation);

                this._mainCamera.updateMatrix();
                this._mainCamera.updateMatrixWorld(false);

                this._mainCamera.projectionMatrix.fromArray(view.projectionMatrix);

                // Set up the _renderer to the XRView's viewport and then render
                const viewport = view.getViewport(this.xrSession.baseLayer);
                this._renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);

                this._renderCore();
            }

        } else {

            this._mainCamera.matrixAutoUpdate = true;
            this._renderCore();
        }
    }

    private _renderCore(): void {
        this._renderer.clear();
        this._renderer.render(this._scene, this._mainCamera);

        // Set the background color to null when rendering the ui world camera.
        if (this._scene.background !== null) {
            this._originalBackground = this._scene.background.clone();
        }

        this._scene.background = null;
        this._renderer.clearDepth(); // Clear depth buffer so that ui objects dont 
        this._renderer.render(this._scene, this._uiWorldCamera);
        this._scene.background = this._originalBackground;
    }

    /**
     * Trigger a refresh of the GameView's file representations.
     * This will effectively clear all current file representations and create new ones for the current context.
     */
    private _triggerFilesRefresh(): void {
        // Unsubscribe from current file events.
        if (this._fileSubs) {
            this._fileSubs.forEach(sub => {
                sub.unsubscribe();
            });
            this._fileSubs = [];
        }

        // Clear our file buffer.
        this._fileBackBuffer = new Map<string, AuxObject>();

        // Dispose of the current context group.
        if (this._contextGroup) {
            this._contextGroup.dispose();
            this._scene.remove(this._contextGroup);
            this._contextGroup = null;
        }

        // Dispose of the current inventory context.
        if (this.inventoryContext) {
            this.inventoryContext.dispose();
            this.inventoryContext = null;
        }

        // Subscribe to file events.
        this._fileSubs.push(this.fileManager.fileChanged(this.fileManager.userFile)
            .pipe(tap(file => {

                const userInventoryContextValue = (<Object>file).tags._userInventoryContext;
                if (!this.inventoryContext || (this.inventoryContext.context !== userInventoryContextValue)) {
                    this.inventoryContext = new InventoryContext(userInventoryContextValue);
                    console.log('[GameView] User changed inventory context to: ', userInventoryContextValue);
                }
            }))
            .subscribe());

        this._fileSubs.push(this.fileManager.fileChanged(this.fileManager.globalsFile)
            .pipe(tap(file => {

                // Update the scene background color.
                let sceneBackgroundColor = (<Object>file).tags['aux.scene.color'];
                if (sceneBackgroundColor) {
                    this._scene.background = new Color(sceneBackgroundColor);;
                }

            }))
            .subscribe());

        this._fileSubs.push(this.fileManager.filesDiscovered
            .pipe(rxFlatMap(files => files), concatMap(files => this._fileAdded(files)))
            .subscribe());
        this._fileSubs.push(this.fileManager.filesRemoved
            .pipe(rxFlatMap(files => files), tap(file => this._fileRemoved(file)))
            .subscribe());
        this._fileSubs.push(this.fileManager.filesUpdated
            .pipe(rxFlatMap(files => files), concatMap(file => this._fileUpdated(file)))
            .subscribe());
    }

    private async _fileAdded(file: AuxFile) {
        this._fileBackBuffer.set(file.id, file);
        let calc = this.fileManager.createContext();

        if (!this._contextGroup) {
            // We dont have a context group yet. We are in search of a file that defines a player context that matches the user's current context.
            const destroyed = isDestroyed(file);
            const result = doesFileDefinePlayerContext(file, this.context, calc);
            if (!destroyed && result.matchFound) {
                // Create ContextGroup3D for this file that we will use to render all files in the context.
                this._contextGroup = new ContextGroup3D(file, 'player', this._decoratorFactory);
                this._scene.add(this._contextGroup);
                await this._contextGroup.fileAdded(file, calc);
                
                // Apply back buffer of files to the newly created context group.
                for (let entry of this._fileBackBuffer) {
                    if (entry[0] !== file.id && !isDestroyed(entry[1])) {
                        await this._contextGroup.fileAdded(entry[1], calc);
                    }
                }
            }
        } else {
            await this._contextGroup.fileAdded(file, calc);
        }
        
        if (this.inventoryContext) {
            await this.inventoryContext.fileAdded(file, calc);
        }

        await this._fileUpdated(file, true);
        this.onFileAdded.invoke(file);

        // Change the user's context after first adding and updating it
        // because the callback for file_updated was happening before we
        // could call fileUpdated from fileAdded.
        if (file.id === this.fileManager.userFile.id) {
            const userFile = appManager.fileManager.userFile;
            console.log('[GameView] Setting user\'s context to: ' + this.context);
            appManager.fileManager.updateFile(userFile, { tags: { _userContext: this.context }});
        }
    }

    private async _fileUpdated(file: AuxFile, initialUpdate = false) {
        this._fileBackBuffer.set(file.id, file);
        let calc = this.fileManager.createContext();

        if (this._contextGroup) {
            // TODO: Implement Tag Updates
            await this._contextGroup.fileUpdated(file, [], calc);
        }

        if (this.inventoryContext) {
            await this.inventoryContext.fileUpdated(file, [], calc);
        }

        if (file.tags._destroyed) {
            this._fileRemoved(file.id);
        }

        this.onFileUpdated.invoke(file);
    }

    private _fileRemoved(id: string) {
        const calc = this.fileManager.createContext();
        if (this._contextGroup) {
            this._contextGroup.fileRemoved(id, calc);

            if (this._contextGroup.file.id === id) {
                // File that defined player context has been removed.
                // Dispose of the context group.
                this._contextGroup.dispose();
                this._scene.remove(this._contextGroup);
                this._contextGroup = null;
            }
        }

        if (this.inventoryContext) {
            this.inventoryContext.fileRemoved(id, calc);
        }
        
        this.onFileRemoved.invoke(null);
    }

    private _setupScene() {

        this._scene = new Scene();

        let globalsFile = this.fileManager.globalsFile;

        if (globalsFile && globalsFile.tags['aux.scene.color']) {
            this._scene.background = new Color(globalsFile.tags['aux.scene.color']);
        } else {
            this._scene.background = new Color(DEFAULT_SCENE_BACKGROUND_COLOR);
        }

        // Main camera
        this._mainCamera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 20000);
        this._mainCamera.position.z = 5;
        this._mainCamera.position.y = 3;
        this._mainCamera.rotation.x = ThreeMath.degToRad(-30);
        this._mainCamera.layers.enable(LayersHelper.Layer_Default);

        // UI World camera.
        // This camera is parented to the main camera.
        this._uiWorldCamera = new PerspectiveCamera(this._mainCamera.fov, this._mainCamera.aspect, this._mainCamera.near, this._mainCamera.far);
        this._mainCamera.add(this._uiWorldCamera);
        this._uiWorldCamera.position.set(0, 0, 0);
        this._uiWorldCamera.rotation.set(0, 0, 0);

        // Ui World camera only draws objects on the 'UI World Layer'.
        this._uiWorldCamera.layers.set(LayersHelper.Layer_UIWorld);

        this._mainCamera.updateMatrixWorld(true);

        this._resizeCamera();
        this._setupRenderer();

        // Ambient light.
        this._ambient = new AmbientLight(0xffffff, 0.7);
        this._scene.add(this._ambient);

        // Sky light.
        this._skylight = new HemisphereLight(0xc1e0fd, 0xffffff, .6);
        this._scene.add(this._skylight);

        // Sun light.
        this._sun = new DirectionalLight(0xffffff, .6);
        this._sun.position.set(5, 5, 5);
        this._sun.position.multiplyScalar(50);
        this._sun.name = "sun";
        this._sun.castShadow = true;
        this._sun.shadowMapWidth = this._sun.shadowMapHeight = 1024 * 2;

        var d = 30;
        this._sun.shadow.camera.left = -d;
        this._sun.shadow.camera.right = d;
        this._sun.shadow.camera.top = d;
        this._sun.shadow.camera.bottom = -d;
        this._sun.shadow.camera.far = 3500;

        this._scene.add(this._sun);

        // Ground plane.
        this._groundPlane = new Plane(new Vector3(0, 1, 0));
    }

    private _setupRenderer() {

        const webGlRenderer = this._renderer = new WebGLRenderer({
            antialias: true,
            alpha: true
        });
        webGlRenderer.autoClear = false;
        webGlRenderer.shadowMap.enabled = false;
        webGlRenderer.shadowMap.type = PCFSoftShadowMap;

        this._resizeRenderer();
        this._canvas = this._renderer.domElement;
        this.gameView.appendChild(this._canvas);
    }

    private _setupWebVR() {

        let onBeforeEnter = () => {
            console.log("[GameView] vr on before enter");

            this._renderer.vr.enabled = true;
            this._renderer.shadowMap.enabled = false;

            // VR controls
            this._vrControls = new VRControlsModule(this._mainCamera);
            this._vrControls.standing = true;

            // Create VR Effect rendering in stereoscopic mode
            this._vrEffect = new VREffectModule(this._renderer);
            this._resizeVR();
            this._renderer.setPixelRatio(window.devicePixelRatio);

            return new Promise((resolve) => {
                resolve(null);
            });
        };

        this.vrDisplay = null;

        // WebVR enable button.
        let vrButtonOptions = {
            color: 'black',
            beforeEnter: onBeforeEnter
        };

        this._enterVr = new webvrui.EnterVRButton(this._canvas, vrButtonOptions);

        // Event handlers for the vr button.
        this._handleReadyVR = this._handleReadyVR.bind(this);
        this._handleEnterVR = this._handleEnterVR.bind(this);
        this._handleExitVR = this._handleExitVR.bind(this);
        this._handleErrorVR = this._handleErrorVR.bind(this);

        this._enterVr.on('ready', this._handleReadyVR);
        this._enterVr.on('enter', this._handleEnterVR);
        this._enterVr.on('exit', this._handleExitVR);
        this._enterVr.on('error', this._handleErrorVR);

        let vrButtonContainer = document.getElementById('vr-button-container');
        vrButtonContainer.appendChild(this._enterVr.domElement);
    }


    // TODO: All this needs to be reworked to use the right WebXR polyfill
    // - Use this one: https://github.com/immersive-web/webxr-polyfill
    // - instead of this one: https://github.com/mozilla/webxr-polyfill

    private async _setupWebXR() {
        const win = <any>window;
        const navigator = <any>win.navigator;
        const xr = navigator.XR;

        if (typeof xr === 'undefined') {
            console.log('[GameView] WebXR Not Supported.');
            return;
        }

        const displays = await xr.getDisplays();
        this.xrSessionInitParameters = {
            exclusive: false,
            type: win.XRSession.AUGMENTATION,
            videoFrames: false,    //computer_vision_data
            alignEUS: true,
            worldSensing: false
        };
        const matchingDisplay = find(displays, d => d.supportsSession(this.xrSessionInitParameters));
        if (matchingDisplay && this._isRealAR(matchingDisplay)) {
            this.xrCapable = true;
            this.xrDisplay = matchingDisplay;
            this.addSidebarItem('enable_xr', 'Enable AR', () => {
                this._toggleXR();
            });
            console.log('[GameView] WebXR Supported!');
        }
    }

    private async _toggleXR() {
        console.log('toggle XR');
        if (this.xrDisplay) {

            if (this.xrSession) {
                this.removeSidebarItem('disable_xr');
                this.addSidebarItem('enable_xr', 'Enable AR', () => {
                    this._toggleXR();
                });

                await this.xrSession.end();
                this.xrSession = null;
                document.documentElement.classList.remove('ar-app');
            } else {
                this.removeSidebarItem('enable_xr');
                this.addSidebarItem('disable_xr', 'Disable AR', () => {
                    this._toggleXR();
                });

                document.documentElement.classList.add('ar-app');
                this.xrSession = await this.xrDisplay.requestSession(this.xrSessionInitParameters);
                this.xrSession.near = 0.1;
                this.xrSession.far = 1000;

                this.xrSession.addEventListener('focus', (ev: any) => this._handleXRSessionFocus());
                this.xrSession.addEventListener('blur', (ev: any) => this._handleXRSessionBlur());
                this.xrSession.addEventListener('end', (ev: any) => this._handleXRSessionEnded());

                this._startXR();

                setTimeout(() => {
                    this._handleResize();
                }, 1000);
            }
        }
    }

    private _startXR() {
        const win = <any>window;
        if (this.xrSession === null) {
            throw new Error('Can not start presenting without a xrSession');
        }

        // Set the xrSession's base layer into which the app will render
        this.xrSession.baseLayer = new win.XRWebGLLayer(this.xrSession, this._renderer.context);

        // Handle layer focus events
        this.xrSession.baseLayer.addEventListener('focus', (ev: any) => { this._handleXRLayerFocus() })
        this.xrSession.baseLayer.addEventListener('blur', (ev: any) => { this._handleXRLayerBlur() })

        // this.xrSession.requestFrame(this._boundHandleFrame)
    }

    private _handleXRSessionFocus() {
    }

    private _handleXRSessionBlur() {
    }

    private _handleXRSessionEnded() {
    }

    private _handleXRLayerFocus() {
    }

    private _handleXRLayerBlur() {
    }

    private _isRealAR(xrDisplay: any): boolean {
        // The worst hack of all time.
        // Basically does the check that the webxr polyfill does
        // to see it the device really supports Web XR.
        return typeof (<any>window).webkit !== 'undefined' ||
            xrDisplay._reality._vrDisplay;
    }

    private _handleReadyVR(display: VRDisplay) {

        console.log("[GameView] vr display is ready.");
        console.log(display);
        this.vrDisplay = display;

        // When being used on a vr headset, force the normal input module to use touch instead of mouse.
        // Touch seems to work better for 2d browsers on vr headsets (like the Oculus Go).
        this.input.currentInputType = InputType.Touch;
    }

    private _handleEnterVR(display: any) {

        console.log('[GameView] enter vr.');
        console.log(display);
        this.vrDisplay = display;
    }

    private _handleExitVR(display: any) {

        console.log('[GameView] exit vr.');
        console.log(display);

        this._renderer.vr.enabled = false;
        this._renderer.shadowMap.enabled = false;

        this._inputVR.disconnectControllers();

        this._vrControls.dispose();
        this._vrControls = null;

        this._vrEffect.dispose();
        this._vrEffect = null;

        // reset camera back to default position.
        this._mainCamera.position.z = 5;
        this._mainCamera.position.y = 3;
        this._mainCamera.rotation.x = ThreeMath.degToRad(-30);
        this._mainCamera.updateMatrixWorld(false);
    }

    private _handleErrorVR() {
        // console.error('error vr');
        // console.error(error);
    }

    private _handleResize() {
        this._resizeCamera();
        this._resizeRenderer();
        this._resizeVR();
    }

    private _resizeRenderer() {
        // TODO: Call each time the screen size changes
        const { width, height } = this._calculateSize();
        this._renderer.setPixelRatio(window.devicePixelRatio || 1);
        this._renderer.setSize(width, height);
        this._container.style.height = this.gameView.style.height = this._renderer.domElement.style.height;
        this._container.style.width = this.gameView.style.width = this._renderer.domElement.style.width;
    }

    private _resizeCamera() {
        const { width, height } = this._calculateSize();
        this._mainCamera.aspect = width / height;
        this._mainCamera.updateProjectionMatrix();

        this._uiWorldCamera.aspect = this._mainCamera.aspect;
        this._uiWorldCamera.updateProjectionMatrix();
    }

    private _resizeVR() {
        if (!this._vrEffect) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        this._vrEffect.setSize(width, height);
    }

    private _calculateSize() {
        const width = window.innerWidth;
        const height = window.innerHeight - this._container.getBoundingClientRect().top;
        return { width, height };
    }

    private get _container() {
        return <HTMLElement>this.$refs.container;
    }
};
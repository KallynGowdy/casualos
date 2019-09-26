import { Object3D, Texture, Color, Vector2 } from 'three';
import { ContextGroup3D } from './ContextGroup3D';
import { BrowserSimulation } from '@casual-simulation/aux-vm-browser';
import {
    File,
    FileCalculationContext,
    hasValue,
    PrecalculatedFile,
    AuxFile,
    GLOBALS_FILE_ID,
} from '@casual-simulation/aux-common';
import { SubscriptionLike } from 'rxjs';
import { concatMap, tap, flatMap as rxFlatMap } from 'rxjs/operators';
import { ArgEvent } from '@casual-simulation/aux-common/Events';
import { CameraRig } from './CameraRigFactory';
import { Game } from './Game';
import { AuxFile3DFinder } from '../AuxFile3DFinder';
import { AuxFile3D } from './AuxFile3D';
import { AuxFile3DDecoratorFactory } from './decorators/AuxFile3DDecoratorFactory';

/**
 * Defines a class that is able to render a simulation.
 */
export abstract class Simulation3D extends Object3D
    implements SubscriptionLike, AuxFile3DFinder {
    protected _subs: SubscriptionLike[];

    /**
     * The game view.
     */
    protected _game: Game;

    closed: boolean;
    onFileAdded: ArgEvent<File> = new ArgEvent<File>();
    onFileUpdated: ArgEvent<File> = new ArgEvent<File>();
    onFileRemoved: ArgEvent<File> = new ArgEvent<File>();

    /**
     * The list of contexts that are being rendered in the simulation.
     */
    contexts: ContextGroup3D[];

    /**
     * The simulation that this object is rendering.
     */
    simulation: BrowserSimulation;

    private _fileMap: Map<string, AuxFile3D[]>;
    private _decoratorFactory: AuxFile3DDecoratorFactory;
    private _sceneBackground: Color | Texture = null;
    private _updateList: Set<string> = new Set();
    private _updatedList: Set<string> = new Set();

    /**
     * Gets the game view that is for this simulation.
     */
    get game() {
        return this._game;
    }

    /**
     * Gets the background color for the simulation.
     */
    get backgroundColor(): Color | Texture {
        return this._sceneBackground;
    }

    get decoratorFactory() {
        return this._decoratorFactory;
    }

    /**
     * Creates a new Simulation3D object that can be used to render the given simulation.
     * @param game The game.
     * @param simulation The simulation to render.
     */
    constructor(game: Game, simulation: BrowserSimulation) {
        super();
        this._game = game;
        this.simulation = simulation;
        this.contexts = [];
        this._subs = [];
        this._decoratorFactory = new AuxFile3DDecoratorFactory(game, this);
    }

    /**
     * Initializes the simulation 3D.
     */
    init() {
        // Subscriptions to file events.
        this._subs.push(
            this.simulation.watcher.filesDiscovered
                .pipe(concatMap(file => this._filesAdded(file)))
                .subscribe()
        );
        this._subs.push(
            this.simulation.watcher.filesRemoved
                .pipe(tap(file => this._filesRemoved(file)))
                .subscribe()
        );
        this._subs.push(
            this.simulation.watcher.filesUpdated
                .pipe(concatMap(update => this._filesUpdated(update, false)))
                .subscribe()
        );
        this._subs.push(
            this.simulation.localEvents
                .pipe(
                    tap(e => {
                        if (e.type === 'tween_to') {
                            const foundFileIn3D = this.contexts.some(c =>
                                c.getFiles().some(f => f.file.id === e.fileId)
                            );
                            if (foundFileIn3D) {
                                this.game.tweenCameraToFile(
                                    this.getMainCameraRig(),
                                    e.fileId,
                                    e.zoomValue,
                                    e.rotationValue
                                        ? new Vector2(
                                              e.rotationValue.x,
                                              e.rotationValue.y
                                          )
                                        : undefined
                                );
                            }
                        }
                    })
                )
                .subscribe()
        );
        this._subs.push(
            this.simulation.watcher
                .fileChanged(GLOBALS_FILE_ID)
                .pipe(
                    tap(file => {
                        // Scene background color.
                        let sceneBackgroundColor = file.tags['aux.scene.color'];
                        this._sceneBackground = hasValue(sceneBackgroundColor)
                            ? new Color(sceneBackgroundColor)
                            : null;
                    })
                )
                .subscribe()
        );
    }

    async _filesUpdated(updates: PrecalculatedFile[], initialUpdate: boolean) {
        let calc = this.simulation.helper.createContext();
        for (let update of updates) {
            await this._fileUpdated(calc, update, initialUpdate);
        }
    }

    async _filesRemoved(files: string[]) {
        let calc = this.simulation.helper.createContext();
        for (let file of files) {
            await this._fileRemoved(calc, file);
        }
    }

    async _filesAdded(files: PrecalculatedFile[]) {
        let calc = this.simulation.helper.createContext();
        for (let file of files) {
            await this._fileAdded(calc, file);
        }
    }

    findFilesById(id: string): AuxFile3D[] {
        if (!this._fileMap) {
            this._updateFileMap();
        }

        return this._fileMap.get(id) || [];
    }

    _updateFileMap() {
        this._fileMap = new Map();
        for (let group of this.contexts) {
            for (let [name, context] of group.contexts) {
                for (let [id, file] of context.files) {
                    const list = this._fileMap.get(id);
                    if (list) {
                        list.push(file);
                    } else {
                        this._fileMap.set(id, [file]);
                    }
                }
            }
        }
    }

    frameUpdate() {
        const calc = this.simulation.helper.createContext();
        for (let id of this._updateList) {
            if (!this._updatedList.has(id)) {
                const files = this.findFilesById(id);
                if (files.length > 0) {
                    this._fileUpdatedCore(calc, <PrecalculatedFile>(
                        files[0].file
                    ));
                }
            }
        }
        this._updateList.clear();
        this._updatedList.clear();

        this._frameUpdateCore(calc);
    }

    /**
     * Ensures that the given files are updated by next frame.
     * @param fileIds The IDs of the files to update.
     */
    ensureUpdate(fileIds: string[]): void {
        for (let id of fileIds) {
            this._updateList.add(id);
        }
    }

    /**
     * Gets the camera that is used as the primary rendering camera for this simulation.
     */
    abstract getMainCameraRig(): CameraRig;

    protected _frameUpdateCore(calc: FileCalculationContext) {
        this.contexts.forEach(context => {
            context.frameUpdate(calc);
        });
    }

    protected async _fileAdded(
        calc: FileCalculationContext,
        file: PrecalculatedFile
    ): Promise<void> {
        this._fileMap = null;
        let context = this._createContext(calc, file);
        if (context) {
            this.contexts.push(context);
            this.add(context);
        }

        await this._fileAddedCore(calc, file);
        await this._fileUpdated(calc, file, true);

        this.onFileAdded.invoke(file);
    }

    protected async _fileAddedCore(
        calc: FileCalculationContext,
        file: PrecalculatedFile
    ): Promise<void> {
        await Promise.all(this.contexts.map(c => c.fileAdded(file, calc)));
    }

    protected async _fileRemoved(
        calc: FileCalculationContext,
        id: string
    ): Promise<void> {
        this._fileMap = null;
        this._fileRemovedCore(calc, id);

        this.onFileRemoved.invoke(null);
    }

    protected _fileRemovedCore(calc: FileCalculationContext, id: string) {
        let removedIndex: number = -1;
        this.contexts.forEach((context, index) => {
            context.fileRemoved(id, calc);
            if (context.file.id === id) {
                removedIndex = index;
            }
        });

        if (removedIndex >= 0) {
            const context = this.contexts[removedIndex];
            this._removeContext(context, removedIndex);
        }
    }

    protected _removeContext(context: ContextGroup3D, removedIndex: number) {
        context.dispose();
        this.remove(context);
        this.contexts.splice(removedIndex, 1);
    }

    protected async _fileUpdated(
        calc: FileCalculationContext,
        file: PrecalculatedFile,
        initialUpdate: boolean
    ): Promise<void> {
        this._fileMap = null;
        let { shouldRemove } = this._shouldRemoveUpdatedFile(
            calc,
            file,
            initialUpdate
        );

        await this._fileUpdatedCore(calc, file);

        this.onFileUpdated.invoke(file);

        if (shouldRemove) {
            this._fileRemoved(calc, file.id);
        }
    }

    protected async _fileUpdatedCore(
        calc: FileCalculationContext,
        file: PrecalculatedFile
    ) {
        if (file != undefined) {
            this._updatedList.add(file.id);
            await Promise.all(
                this.contexts.map(c => c.fileUpdated(file, [], calc))
            );
        }
    }

    protected _shouldRemoveUpdatedFile(
        calc: FileCalculationContext,
        file: PrecalculatedFile,
        initialUpdate: boolean
    ): { shouldRemove: boolean } {
        return {
            shouldRemove: false,
        };
    }

    unsubscribe(): void {
        this._subs.forEach(s => s.unsubscribe());
        this.remove(...this.children);
        this.contexts.splice(0, this.contexts.length);
        this.closed = true;
        this._subs = [];
        this._fileMap = null;
    }

    /**
     * Creates a new context group for the given file.
     * @param file The file to create the context group for.
     */
    protected abstract _createContext(
        calc: FileCalculationContext,
        file: PrecalculatedFile
    ): ContextGroup3D;
}

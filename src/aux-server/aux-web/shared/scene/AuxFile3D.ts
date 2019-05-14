import { GameObject } from './GameObject';
import { AuxFile } from '@casual-simulation/aux-common/aux-format';
import {
    Object3D,
    Mesh,
    SceneUtils,
    Box3,
    Sphere,
    Group,
    Vector3,
    Box3Helper,
    Color,
} from 'three';
import {
    File,
    TagUpdatedEvent,
    AuxDomain,
    isFileInContext,
    getBuilderContextGrid,
    calculateGridScale,
    AsyncCalculationContext,
} from '@casual-simulation/aux-common';
import { createCube, calculateScale, findParentScene } from './SceneUtils';
import { AuxFile3DDecorator } from './AuxFile3DDecorator';
import { ContextPositionDecorator } from './decorators/ContextPositionDecorator';
import { FileShapeDecorator } from './decorators/FileShapeDecorator';
import { ContextGroup3D } from './ContextGroup3D';
import { ScaleDecorator } from './decorators/ScaleDecorator';
import { LabelDecorator } from './decorators/LabelDecorator';
import { UserMeshDecorator } from './decorators/UserMeshDecorator';
import { AuxFile3DDecoratorFactory } from './decorators/AuxFile3DDecoratorFactory';
import { appManager } from '../AppManager';
import { DebugObjectManager } from './DebugObjectManager';
import { Simulation3D } from './Simulation3D';

/**
 * Defines a class that is able to display Aux files.
 */
export class AuxFile3D extends GameObject {
    /**
     * The context this file visualization was created for.
     */
    context: string;

    /**
     * The domain that this file visualization is in.
     */
    domain: AuxDomain;

    /**
     * The context group that this visualization belongs to.
     */
    contextGroup: ContextGroup3D;

    /**
     * The file for the mesh.
     */
    file: File;

    /**
     * The things that are displayed by this file.
     */
    display: Group;

    /**
     * The list of decorators that this file is using.
     */
    decorators: AuxFile3DDecorator[];

    private _boundingBox: Box3 = null;
    private _boundingSphere: Sphere = null;

    /**
     * Returns a copy of the file 3d's current bounding box.
     */
    get boundingBox(): Box3 {
        return this._boundingBox ? this._boundingBox.clone() : null;
    }

    /**
     * Returns a copy of the file 3d's current bounding sphere.
     */
    get boundingSphere(): Sphere {
        return this._boundingSphere ? this._boundingSphere.clone() : null;
    }

    constructor(
        file: File,
        contextGroup: ContextGroup3D,
        context: string,
        domain: AuxDomain,
        colliders: Object3D[],
        decoratorFactory: AuxFile3DDecoratorFactory
    ) {
        super();
        this.file = file;
        this.domain = domain;
        this.contextGroup = contextGroup;
        this.colliders = colliders;
        this.context = context;
        this.display = new Group();
        this.add(this.display);

        this.decorators = decoratorFactory.loadDecorators(this);
    }

    /**
     * Update the internally cached representation of this aux file 3d's bounding box and sphere.
     */
    computeBoundingObjects(): void {
        // Calculate Bounding Box
        if (this._boundingBox === null) {
            this._boundingBox = new Box3();
        }

        this._boundingBox.setFromObject(this.display);

        // Calculate Bounding Sphere
        if (this._boundingSphere === null) {
            this._boundingSphere = new Sphere();
        }
        this._boundingBox.getBoundingSphere(this._boundingSphere);
    }

    /**
     * Notifies the mesh that the given file has been added to the state.
     * @param file The file.
     * @param calc The calculation context.
     */
    fileAdded(file: AuxFile) {
        // TODO:
        // (probably don't need to do anything here cause formulas updates will propogate to fileUpdated())
    }

    /**
     * Notifies this mesh that the given file has been updated.
     * @param file The file that was updated.
     * @param updates The updates that happened on the file.
     * @param calc The calculation context.
     */
    async fileUpdated(
        calc: AsyncCalculationContext,
        file: File,
        updates: TagUpdatedEvent[]
    ) {
        if (await this._shouldUpdate(calc, file)) {
            if (file.id === this.file.id) {
                this.file = file;
            }
            for (let i = 0; i < this.decorators.length; i++) {
                await this.decorators[i].fileUpdated(calc);
            }
        }
    }

    /**
     * Notifies the mesh that the given file was removed.
     * @param file The file that was removed.
     * @param calc The calculation context.
     */
    fileRemoved(calc: AsyncCalculationContext, file: AuxFile) {
        // TODO:
    }

    async frameUpdate(calc: AsyncCalculationContext) {
        if (this.decorators) {
            for (let i = 0; i < this.decorators.length; i++) {
                await this.decorators[i].frameUpdate(calc);
            }
        }
    }

    dispose() {
        super.dispose();
        if (this.decorators) {
            this.decorators.forEach(d => {
                d.dispose();
            });
        }
    }

    private async _shouldUpdate(
        calc: AsyncCalculationContext,
        file: File
    ): Promise<boolean> {
        return (
            file.id === this.file.id ||
            (await calc.isFileInContext(file, this.context)) ||
            (this.contextGroup && this.contextGroup.file.id === file.id)
        );
    }
}

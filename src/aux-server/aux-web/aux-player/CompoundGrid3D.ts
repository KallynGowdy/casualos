import { Grid3D, GridTile } from './Grid3D';
import { Ray, Vector3 } from 'three';

/**
 * Defines a class that represents multiple grids.
 */
export class CompoundGrid3D implements Grid3D {
    grids: Grid3D[] = [];

    get enabled() {
        return true;
    }

    get primaryGrid() {
        return this.grids[0];
    }

    getTileFromRay(ray: Ray): GridTile {
        let closestTile: GridTile = null;
        let closestDist: number = Infinity;
        for (let grid of this.grids) {
            if (!grid.enabled) {
                continue;
            }
            const tile = grid.getTileFromRay(ray);
            if (tile) {
                const dist = ray.origin.distanceTo(tile.center);
                if (dist < closestDist) {
                    closestTile = tile;
                    closestDist = dist;
                }
            }
        }

        return closestTile;
    }

    /**
     * Scales the given position by the tile scale and returns the result.
     * @param position The input position.
     */
    getGridPosition(position: Vector3): Vector3 {
        const grid = this.primaryGrid;
        if (!grid) {
            throw new Error(
                'Cannot scale the position because no primrary grid exists!'
            );
        }

        return grid.getGridPosition(position);
    }
}
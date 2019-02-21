import { Atom, AtomId, AtomOp, StorableAtomId, idEquals } from "./Atom";
import { VirtualArray } from "./VirtualArray";
import { sortBy, findIndex } from "lodash";

/**
 * Creates a weave reference.
 * @param atom 
 * @param index 
 * @param causeIndex 
 */
export function reference<T extends AtomOp>(atom: Atom<T>, index: number, causeIndex: number): WeaveReference<T> {
    return {
        atom,
        index,
        causeIndex
    };
}

/**
 * Defines a reference to an atom inside a weave.
 * Once created, this reference will always be valid.
 */
export interface WeaveReference<TOp extends AtomOp> {

    /**
     * The atom that this reference refers to.
     */
    atom: Atom<TOp>;

    /**
     * The index in the site that this atom refers to.
     * Because sites cannot create concurrent atoms,
     * this value will always be valid.
     */
    index: number;

    /**
     * The index in the site that is this atom's cause.
     */
    causeIndex: number;
}

/**
 * Defines a weave. 
 * That is, the depth-first preorder traversal of a causal tree.
 */
export class Weave<TOp extends AtomOp> {
    private _atoms: WeaveReference<TOp>[];
    private _sites: SiteMap;
    private _version: number;

    /**
     * The yarn of the weave.
     * Yarn is just a fancy name for an array that is split into
     * different segments where each segment represents a particular site's
     * atoms.
     * 
     * In the context of Causal Trees, yarn is useful because it gives us an easy way to prune the tree
     * without causing errors. Once pruned we can simply recreate the tree via re-inserting everything.
     */
    private _yarn: WeaveReference<TOp>[];

    /**
     * Gets the list of atoms stored in this weave.
     * The order is the depth-first traversal of the causal tree.
     */
    get atoms() {
        return this._atoms;
    }

    /**
     * Creates a new weave.
     */
    constructor() {
        this._atoms = [];
        this._yarn = [];
        this._sites = {};
    }

    /**
     * Gets the list of atoms for a site.
     * @param site The site identifier.
     */
    getSite(site: number): VirtualArray<WeaveReference<TOp>> {
        const siteIndex = this._sites[site];
        if (typeof siteIndex === 'undefined') {
            return new VirtualArray(this._yarn, this._yarn.length);
        } else {
            return new VirtualArray(this._yarn, siteIndex.start, siteIndex.end);
        }
    }

    /**
     * Inserts the given atom into the weave.
     * @param atom 
     */
    insert<T extends TOp>(atom: Atom<T>): WeaveReference<T> {
        const site = this.getSite(atom.id.site);
        if (!atom.cause) {
            const ref = reference<T>(atom, 0, null);
            // Add the atom at the root of the weave.
            this._atoms.splice(0, 0, ref);
            site.insert(0, ref);
            this._sites[atom.id.site] = {
                start: site.start,
                end: site.end
            };
            return ref;
        } else {
            const causeIndex = this._indexOf(atom.cause);
            const cause = this.atoms[causeIndex];
            const weaveIndex = this._weaveIndex(causeIndex, atom.id);
            const siteIndex = this._siteIndex(atom.id, site);
            const ref = reference<T>(atom, siteIndex, cause ? cause.index : null);
            this._atoms.splice(weaveIndex, 0, ref);
            site.insert(siteIndex, ref);
            this._sites[atom.id.site] = {
                start: site.start,
                end: site.end
            };

            return ref;
        }
    }

    /**
     * Inserts the given list of atoms into the weave.
     * @param atoms The atoms to insert.
     */
    insertMany<T extends TOp>(...atoms: Atom<T>[]) {
        atoms.forEach(a => {
            this.insert(a);
        });
    }

    /**
     * Gets the atom for the given reference.
     * @param reference The reference.
     */
    getAtom<T extends TOp>(id: AtomId, index: number): WeaveReference<T> {
        const site = this.getSite(id.site);
        return <WeaveReference<T>>site.get(index);
    }

    /**
     * Imports the given list of atoms into this weave.
     * The atoms are assumed to be pre-sorted.
     * @param atoms The atoms to import into this weave.
     */
    import(atoms: WeaveReference<TOp>[]) {
        
        let localOffset = 0;
        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            let local = this._atoms[i + localOffset];

            // No more local atoms, so the remote atoms are merely append
            // operations
            if (!local) {
                // Short circut by appending the rest.
                const finalAtoms = atoms.slice(i);
                this._atoms.splice(this._atoms.length, 0, ...finalAtoms);

                this._yarn.length = this._yarn.length + finalAtoms.length;

                for (let b = 0; b < finalAtoms.length; b++) {
                    const ref = finalAtoms[b];
                    const site = this.getSite(ref.atom.id.site);
                    site.set(ref.index, ref);
                    this._sites[ref.atom.id.site] = {
                        start: site.start,
                        end: site.end
                    };
                }
                break;
            } else {
                // Could either be the same, a new sibling, or a new child of the current subtree

                let order = this._compareAtoms(a.atom, local.atom);
                if (order === 0) {
                    // Atoms are equal, no action needed.
                } else if(order < 0) {
                    // New atom should be before local atom.
                    // insert at this index.
                    this._atoms.splice(i + localOffset, 0, a);
                    const site = this.getSite(a.atom.id.site);
                    site.set(a.index, a);
                    this._sites[a.atom.id.site] = {
                        start: site.start,
                        end: site.end
                    };
                } else if(order > 0) {
                    // New atom should be after local atom.
                    // Skip local atoms until we find the right place to put the new atom.
                    do {
                        localOffset += 1;
                        local = this._atoms[i + localOffset];
                    } while(local && a.atom.id.timestamp <= local.atom.cause.timestamp);
                    
                    order = this._compareAtoms(a.atom, local.atom);
                    if (order < 0) {
                        this._atoms.splice(i + localOffset, 0, a);
                        const site = this.getSite(a.atom.id.site);
                        site.set(a.index, a);
                        this._sites[a.atom.id.site] = {
                            start: site.start,
                            end: site.end
                        };
                    }
                }
            }
        }
        
        // if (this.atoms.length === 0) {
        //     this._setYarn(atoms);
        //     this._atoms = atoms.slice();
        // } else if(atoms.length > 0) {
        //     const firstParent = atoms[0].cause;
        //     let i = findIndex(this._atoms, a => a.id.equals(firstParent.id));

        //     for (let i = 0; i < this._atoms.length && atoms.length; i++) {
        //         const local = this._atoms[i];
        //         const remote = atoms[i];
                
        //     }
        // }
        // const length = Math.min(atoms.length, this._atoms.length);
        // let i = 0;
        // let b = 0;
        // while(i < this._atoms.length && b < atoms.length) {
        //     const localAtom = this._atoms[i];
        //     const remoteAtom = atoms[i];
        // }
        // for (let i = 0; i < this.atoms.length; i++) {
            
        //     if (localAtom.id.equals(remoteAtom.id)) {
        //         continue;
        //     } else {

        //     }
        // }
        // const remaining 
    }

    private _sortYarn() {
        this._yarn = sortBy(this._yarn, ['atom.id.site', 'atom.id.timestamp', 'atom.id.priority']);

        let currentSite = null;
        let siteStart = 0;
        for (let i = 0; i < this._yarn.length; i++) {
            const ref = this._yarn[i];
            const newSite = ref.atom.id.site;
            if (currentSite !== newSite) {
                if (currentSite) {
                    this._sites[currentSite] = {
                        start: siteStart,
                        end: i
                    };
                }
                siteStart = i;
                currentSite = ref.atom.id.site;
            }
        }
        if (currentSite) {
            this._sites[currentSite] = {
                start: siteStart,
                end: this._yarn.length
            };
        }
    }

    /**
     * Finds the index that an atom should appear at in a yarn.
     */
    private _siteIndex(atomId: AtomId, site: VirtualArray<WeaveReference<TOp>>): number {
        for (let i = site.length - 1; i >= 0; i--) {
            const ref = site.get(i);
            if (atomId.timestamp < ref.atom.id.timestamp) {
                return i;
            } else if(atomId.timestamp === ref.atom.id.timestamp && atomId.priority > ref.atom.id.priority) {
                return i;
            }
        }
        return site.length;
    }

    /**
     * Finds the index that an atom should appear at in the weave.
     * @param causeIndex The index of the parent for the atom.
     * @param atomId The ID of the atom to find the index for.
     */
    private _weaveIndex(causeIndex: number, atomId: AtomId): number {
        const cause = this._atoms[causeIndex];
        let index = causeIndex + 1;
        for (; index < this._atoms.length; index++) {
            const ref = this._atoms[index];
            const order = this._compareAtomIds(atomId, ref.atom.id);
            if (order < 0) {
                break;
            }
            
            if (!idEquals(ref.atom.cause, cause.atom.id)) {
                break;
            }
        }

        return index;
    }

    /**
     * Finds the index that the atom with the given ID is in the atoms array.
     * @param atom The atom ID to search for.
     */
    private _indexOf(id: AtomId): number {
        for (let i = this._atoms.length - 1; i >= 0; i--) {
            const ref = this._atoms[i];
            if (idEquals(ref.atom.id, id)) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Compares the two atoms to see which should be sorted in front of the other.
     * Returns -1 if the first should be before the second.
     * Returns 0 if they are equal.
     * Returns 1 if the first should be after the second.
     * @param first The first atom.
     * @param second The second atom.
     */
    private _compareAtoms(first: Atom<TOp>, second: Atom<TOp>): number {
        const cause = this._compareAtomIds(first.cause, second.cause);
        if (cause === 0) {
            return this._compareAtomIds(first.id, second.id);
        }
        return cause;
    }

    /**
     * Determines if the first atom ID should sort before, at, or after the second atom ID.
     * Returns -1 if the first should be before the second.
     * Returns 0 if the IDs are equal.
     * Returns 1 if the first should be after the second.
     * @param first The first atom ID.
     * @param second The second atom ID.
     */
    private _compareAtomIds(first: AtomId, second: AtomId) {
        if (!first && second) {
            return -1;
        } else if(!second && first) {
            return 1;
        } else if (first === second) {
            return 0;
        }
        if (first.priority > second.priority) {
            return -1;
        } else if(first.priority < second.priority) {
            return 1;
        } else if (first.priority === second.priority) {
            if (first.timestamp > second.timestamp) {
                return -1;
            } else if(first.timestamp < second.timestamp) {
                return 1;
            } else if (first.timestamp === second.timestamp) {
                if (first.site < second.site) {
                    return -1;
                } else if(first.site > second.site) {
                    return 1;
                }
            }
        }
        return 0;
    }

    /**
     * Builds a weave from an array of atoms.
     * This array is assumed to already be sorted in the correct order.
     * If the array was obtained from Weave.atoms, then it will be in the correct order. 
     * @param refs The atom references that the new weave should be built from.
     */
    static buildFromArray<TOp extends AtomOp>(refs: WeaveReference<TOp>[]): Weave<TOp> {
        let weave = new Weave<TOp>();
        weave.import(refs);
        return weave;
    }
}

/**
 * Defines a map from site IDs to indexes in an array of atoms.
 * This is used to make it easy to jump to a specific site's atoms
 * even though they are stored in the same array.
 */
export interface SiteMap {
    [site: number]: {start: number, end: number};
}
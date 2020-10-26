import {
    AuxOpType,
    AuxOp,
    TagOp,
    ValueOp,
    BotOp,
    CertificateOp,
    TagMaskOp,
    InsertOp,
} from './AuxOpTypes';
import {
    Weave,
    WeaveNode,
    iterateCausalGroup,
    Atom,
    SiteStatus,
    addAtom,
    first,
    iterateChildren,
    idEquals,
    AtomId,
    atom,
    VersionVector,
} from '@casual-simulation/causal-trees/core2';
import reducer from './AuxWeaveReducer';
import isEqual from 'lodash/isEqual';
import { splice } from '../utils';
import { sortBy } from 'lodash';

/**
 * Finds the first weave node that defines a bot with the given ID.
 * @param weave The weave to search through.
 * @param id The bot ID.
 */
export function findBotNode(weave: Weave<AuxOp>, id: string): WeaveNode<BotOp> {
    return first(findBotNodes(weave, id)) || null;
}

/**
 * Finds all of the weave nodes that define a bot with the given ID.
 * @param weave The weave to search through.
 * @param id The bot ID.
 */
export function* findBotNodes(
    weave: Weave<AuxOp>,
    id: string
): IterableIterator<WeaveNode<BotOp>> {
    for (let root of weave.roots) {
        if (
            root.atom.value.type === AuxOpType.Bot &&
            root.atom.value.id === id
        ) {
            const firstAtom = first(iterateCausalGroup(root));
            if (!firstAtom || firstAtom.atom.value.type !== AuxOpType.Delete) {
                yield root as WeaveNode<BotOp>;
            }
        }
    }
}

/**
 * Finds the weave node that represents the given tag on the given bot node.
 * @param bot The bot node that should be searched.
 * @param tag The tag to find.
 */
export function findTagNode(
    bot: WeaveNode<AuxOp>,
    tag: string
): WeaveNode<TagOp> {
    for (let node of iterateCausalGroup(bot)) {
        if (
            node.atom.value.type === AuxOpType.Tag &&
            node.atom.value.name === tag
        ) {
            return node as WeaveNode<TagOp>;
        }
    }

    return null;
}

/**
 * Finds the tag mask node for the given bot ID and tag.
 * @param weave The weave.
 * @param botId The ID of the bot.
 * @param tag The tag.
 */
export function* findTagMaskNodes(
    weave: Weave<AuxOp>,
    botId: string,
    tag: string
): IterableIterator<WeaveNode<TagMaskOp>> {
    for (let root of weave.roots) {
        if (
            root.atom.value.type === AuxOpType.TagMask &&
            root.atom.value.botId === botId &&
            root.atom.value.name === tag
        ) {
            const firstAtom = first(iterateCausalGroup(root));
            if (!firstAtom || firstAtom.atom.value.type !== AuxOpType.Delete) {
                yield root as WeaveNode<TagMaskOp>;
            }
        }
    }
}

/**
 * Finds the first value weave node for the given tag node.
 * @param tag The tag node that should be searched.
 */
export function findValueNode(tag: WeaveNode<AuxOp>): WeaveNode<ValueOp> {
    for (let node of iterateCausalGroup(tag)) {
        if (node.atom.value.type === AuxOpType.Value) {
            return node as WeaveNode<ValueOp>;
        }
    }

    return null;
}

/**
 * Finds the first value weave node for the given tag node and value.
 * @param tag The tag node that should be searched.
 * @param value The value that should be matched.
 */
export function findValueNodeByValue(
    tag: WeaveNode<AuxOp>,
    value: any
): WeaveNode<ValueOp> {
    for (let node of iterateCausalGroup(tag)) {
        if (
            node.atom.value.type === AuxOpType.Value &&
            isEqual(node.atom.value.value, value)
        ) {
            return node as WeaveNode<ValueOp>;
        }
    }

    return null;
}

/**
 * Finds the node and index at which the given edit should happen at.
 * Useful for applying edits to a causal tree.
 * @param value The value node.
 * @param version The last timestamps that were available when the edit was made.
 * @param index The index at which the edit should happen.
 */
export function findEditPosition(
    value: WeaveNode<AuxOp>,
    version: VersionVector,
    index: number
): EditPosition;

/**
 * Finds the nodes and indexes at which the given edit should happen at.
 * Useful for applying edits to a causal tree.
 * @param value The value node.
 * @param version The last timestamps that were available when the edit was made.
 * @param index The index at which the edit should happen.
 * @param deleteCount The number of characters that get deleted starting at the index.
 */
export function findEditPosition(
    value: WeaveNode<AuxOp>,
    version: VersionVector,
    index: number,
    deleteCount: number
): EditPosition[];

/**
 * Finds the node and index at which the given edit should happen at.
 * Useful for applying edits to a causal tree.
 * @param value The value node.
 * @param version The last timestamps that were available when the edit was made.
 * @param index The index at which the edit should happen.
 * @param deleteCount The number of characters that get deleted starting at the index.
 */
export function findEditPosition(
    value: WeaveNode<AuxOp>,
    version: VersionVector,
    index: number,
    deleteCount?: number
): EditPosition | EditPosition[] {
    if (value.atom.value.type !== AuxOpType.Value) {
        throw new Error(
            'Invalid Argument. The weave node must be a value node.'
        );
    }

    const children = [value, ...iterateCausalGroup(value)];
    const filtered = children.filter((c) => {
        const timestamp = version[c.atom.id.site] || -1;
        return c.atom.id.timestamp <= timestamp;
    });
    const edits = calculateOrderedEdits(filtered);

    return findSingleEditPosition(index, edits);
}

/**
 * Finds the list of edit positions that an edit at the given index and the given delete count should cover.
 * @param index The index.
 * @param deleteCount The delete count.
 * @param edits The text segments.
 */
export function findMultipleEditPositions(
    index: number,
    deleteCount: number,
    edits: TextSegment[]
) {
    let count = 0;
    let positions = [] as EditPosition[];
    let remaining = deleteCount;
    for (let edit of edits) {
        let reachedStart = count + edit.text.length >= index;
        if (reachedStart) {
            const relativeIndex = Math.abs(count - index);
            const countUntilEnd = edit.text.length - relativeIndex;
            const nodeDeleteCount = Math.min(countUntilEnd, remaining);
            const textBefore = edit.marked.slice(0, relativeIndex);
            const textAfter = edit.marked.slice(
                relativeIndex,
                edit.marked.length
            );

            let removedCharacterCount = 0;
            let deleteCountOffset = 0;
            for (let char of textBefore) {
                if (char === '\0') {
                    removedCharacterCount += 1;
                }
            }
            let afterIndex = 0;
            for (let char of textAfter) {
                if (afterIndex >= nodeDeleteCount) {
                    break;
                }
                if (char === '\0') {
                    deleteCountOffset += 1;
                } else {
                    afterIndex += 1;
                }
            }

            positions.push({
                index: relativeIndex + removedCharacterCount + edit.offset,
                count: nodeDeleteCount + deleteCountOffset,
                node: edit.node,
            });

            remaining -= nodeDeleteCount;
        } else {
            count += edit.text.length;
        }
        if (remaining <= 0) {
            break;
        }
    }

    return positions;
}

/**
 * Finds the single position that an edit at the given index should be added at.
 * @param index The index.
 * @param edits The edits.
 */
export function findSingleEditPosition(index: number, edits: TextSegment[]) {
    let count = 0;
    for (let edit of edits) {
        if (count + edit.text.length >= index) {
            const relativeIndex = Math.abs(count - index);
            const textBefore = edit.marked.slice(0, relativeIndex);
            const textAfter = edit.marked.slice(
                relativeIndex,
                edit.marked.length
            );

            let removedCharacterCount = 0;
            for (let char of textBefore) {
                if (char === '\0') {
                    removedCharacterCount += 1;
                }
            }
            for (let char of textAfter) {
                if (char === '\0') {
                    removedCharacterCount += 1;
                } else {
                    break;
                }
            }

            return {
                index: relativeIndex + removedCharacterCount + edit.offset,
                node: edit.node,
            };
        }
        count += edit.text.length;
    }

    return null;
}

/**
 * Calculates the list of ordered edits for the given value node.
 * This iterates each insert op and delete op and returns a list of text segments that have been derived from the value.
 * @param nodes The list of nodes that the edits should be calculated from.
 */
export function calculateOrderedEdits(
    nodes: WeaveNode<AuxOp>[]
): TextSegment[] {
    let segments = [] as TextSegmentInfo[];

    for (let node of nodes) {
        const atomValue = node.atom.value;
        if (atomValue.type === AuxOpType.Value) {
            let segment: TextSegmentInfo = {
                text: atomValue.value,
                node: node as WeaveNode<ValueOp>,
                offset: 0,
                totalLength: atomValue.value.length,
            };
            segments.push(segment);
        } else if (atomValue.type === AuxOpType.Insert) {
            const segment: TextSegmentInfo = {
                text: atomValue.text,
                node: node as WeaveNode<InsertOp>,
                offset: 0,
                totalLength: atomValue.text.length,
            };
            let count = 0;
            let lastCause = 0;
            let added = false;
            for (let i = 0; i < segments.length; i++) {
                const lastSegment = segments[i];
                if (!idEquals(lastSegment.node.atom.id, node.atom.cause)) {
                    continue;
                }
                lastCause = i;
                if (atomValue.index <= 0) {
                    segments.splice(i, 0, segment);
                    added = true;
                    break;
                } else if (atomValue.index - count < +lastSegment.text.length) {
                    const first: TextSegmentInfo = {
                        text: lastSegment.text.slice(
                            0,
                            atomValue.index - count
                        ),
                        node: lastSegment.node,
                        offset: lastSegment.offset + 0,
                        totalLength: lastSegment.totalLength,
                    };
                    const second: TextSegmentInfo = {
                        text: lastSegment.text.slice(atomValue.index - count),
                        offset: lastSegment.offset + (atomValue.index - count),
                        node: lastSegment.node,
                        totalLength: lastSegment.totalLength,
                    };

                    segments.splice(i, 1, first, segment, second);
                    added = true;
                    break;
                }

                count += lastSegment.text.length;
            }
            if (!added) {
                segments.splice(lastCause + 1, 0, segment);
            }
        } else if (atomValue.type === AuxOpType.Delete) {
            let lastSegment = segments.find((s) =>
                idEquals(s.node.atom.id, node.atom.cause)
            );
            if (lastSegment) {
                for (let i = atomValue.start; i < atomValue.end; i++) {
                    lastSegment.text = splice(lastSegment.text, i, 1, '\0');
                }
            }
        }
    }

    return segments
        .map((s) => ({
            text: s.text.replace(/\0/g, ''),
            marked: s.text,
            offset: s.offset,
            node: s.node,
        }))
        .filter((s) => s.text.length > 0);
}

/**
 * Defines an interface that represents a segment of text that has been derived from a node.
 */
export interface TextSegment {
    /**
     * The text of the edit.
     */
    text: string;

    /**
     * The index offset that this segment starts at.
     * Useful when the node was split into two segments.
     */
    offset: number;

    /**
     * The text that includes null characters to indicate characters that were deleted.
     */
    marked: string;

    /**
     * The node that the edit text was produced from.
     */
    node: WeaveNode<ValueOp | InsertOp>;
}

/**
 * Defines an interface that contains extra information about a text segment.
 */
export interface TextSegmentInfo {
    /**
     * The text of the edit.
     */
    text: string;

    /**
     * The total length of text sequences.
     */
    totalLength: number;

    /**
     * The index offset that this segment starts at.
     * Useful when the node was split into two segments.
     */
    offset: number;

    /**
     * The node that the edit text was produced from.
     */
    node: WeaveNode<ValueOp | InsertOp>;
}

export interface EditPosition {
    node: WeaveNode<AuxOp>;
    index: number;
    count?: number;
}

// /**
//  * Adds the given atom to the weave.
//  * Returns the new site status, weave result, atom that was added, and status update.
//  * @param weave The weave.
//  * @param site The site.
//  * @param atom The atom.
//  */
// export function addAuxAtom<T extends AuxOp>(
//     weave: Weave<T>,
//     site: SiteStatus,
//     atom: Atom<T>
// ) {
//     const info = addAtom(weave, site, atom);
//     const update = reducer(weave, info.result);

//     return {
//         ...info,
//         update,
//     };
// }

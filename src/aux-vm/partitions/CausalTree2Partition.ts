import {
    User,
    RealtimeCausalTree,
    StatusUpdate,
    DeviceAction,
    USERNAME_CLAIM,
    DEVICE_ID_CLAIM,
    SESSION_ID_CLAIM,
    USER_ROLE,
} from '@casual-simulation/causal-trees';
import {
    Weave,
    WeaveResult,
    atom,
    atomId,
    Atom,
    SiteStatus,
    newSite,
    createAtom,
    updateSite,
    WeaveNode,
    iterateCausalGroup,
} from '@casual-simulation/causal-trees/core2';
import {
    AuxOp,
    reducer,
    bot,
    BotStateUpdates,
    updates,
    apply,
    AuxOpType,
    del,
    tag,
    value,
    BotOp,
    TagOp,
    ValueOp,
    findValueNode,
    findTagNode,
    findBotNode,
} from '@casual-simulation/aux-common/aux-format-2';
import { Observable, Subscription, Subject, BehaviorSubject } from 'rxjs';
import { AuxPartitionBase, CausalTree2Partition } from './AuxPartition';
import { filter, map, switchMap, startWith } from 'rxjs/operators';
import {
    BotAction,
    Bot,
    BotsState,
    UpdatedBot,
    merge,
    BotTags,
    hasValue,
    getActiveObjects,
    AddBotAction,
    RemoveBotAction,
    UpdateBotAction,
    breakIntoIndividualEvents,
} from '@casual-simulation/aux-common';
import { PartitionConfig } from './AuxPartitionConfig';
import flatMap from 'lodash/flatMap';

/**
 * Attempts to create a CausalTree2Partition from the given config.
 * @param config The config.
 */
export function createCausalTree2Partition(
    config: PartitionConfig,
    user: User
): CausalTree2Partition {
    if (config.type === 'causal_tree_2') {
        return new CausalTree2PartitionImpl(user);
    }
    return undefined;
}

export class CausalTree2PartitionImpl implements CausalTree2Partition {
    protected _onBotsAdded = new Subject<Bot[]>();
    protected _onBotsRemoved = new Subject<string[]>();
    protected _onBotsUpdated = new Subject<UpdatedBot[]>();

    protected _onError = new Subject<any>();
    protected _onEvents = new Subject<DeviceAction[]>();
    protected _onStatusUpdated = new Subject<StatusUpdate>();
    protected _hasRegisteredSubs = false;
    private _sub = new Subscription();
    private _user: User;

    private _weave: Weave<AuxOp> = new Weave<AuxOp>();
    private _site: SiteStatus = newSite();
    private _state: BotsState = {};

    get onBotsAdded(): Observable<Bot[]> {
        return this._onBotsAdded.pipe(startWith(getActiveObjects(this._state)));
    }

    get onBotsRemoved(): Observable<string[]> {
        return this._onBotsRemoved;
    }

    get onBotsUpdated(): Observable<UpdatedBot[]> {
        return this._onBotsUpdated;
    }

    get onError(): Observable<any> {
        return this._onError;
    }

    get onEvents(): Observable<DeviceAction[]> {
        return this._onEvents;
    }

    get onStatusUpdated(): Observable<StatusUpdate> {
        return this._onStatusUpdated;
    }

    unsubscribe() {
        return this._sub.unsubscribe();
    }

    get closed(): boolean {
        return this._sub.closed;
    }

    get state() {
        return this._state;
    }

    type = 'causal_tree_2' as const;

    constructor(user: User) {
        this._user = user;
    }

    async applyEvents(events: BotAction[]): Promise<BotAction[]> {
        const finalEvents = flatMap(events, e => {
            if (e.type === 'apply_state') {
                return breakIntoIndividualEvents(this.state, e);
            } else if (
                e.type === 'add_bot' ||
                e.type === 'remove_bot' ||
                e.type === 'update_bot'
            ) {
                return [e] as const;
            } else {
                return [];
            }
        });

        this._applyEvents(finalEvents);

        return [];
    }

    async init(): Promise<void> {
        this._weave = new Weave<AuxOp>();
    }

    connect(): void {
        this._onStatusUpdated.next({
            type: 'connection',
            connected: true,
        });

        this._onStatusUpdated.next({
            type: 'authentication',
            authenticated: true,
        });

        this._onStatusUpdated.next({
            type: 'authorization',
            authorized: true,
        });

        this._onStatusUpdated.next({
            type: 'sync',
            synced: true,
        });
    }

    private _applyEvents(
        events: (AddBotAction | RemoveBotAction | UpdateBotAction)[]
    ) {
        const addAtom = (cause: Atom<any>, op: AuxOp, priority?: number) => {
            const a = createAtom(this._site, cause, op, priority);
            const result = this._weave.insert(a);
            this._site = updateSite(this._site, result);
            const update = reducer(this._weave, result);

            stateUpdate = merge(stateUpdate, update);

            // TODO: Return the correct atom in case of conflicts
            return a;
        };

        const updateTags = (bot: WeaveNode<BotOp>, tags: BotTags) => {
            for (let key in tags) {
                let node = findTagNode(bot, key);
                const val = tags[key];
                if (!node) {
                    // create new tag
                    const newAtom = addAtom(bot.atom, tag(key));
                    node = this._weave.getNode(newAtom.id) as WeaveNode<TagOp>;
                }

                const currentVal = findValueNode(node);
                if (!currentVal || val !== currentVal.atom.value.value) {
                    // update value
                    addAtom(node.atom, value(val));
                }
            }
        };

        let stateUpdate: any = {};

        for (let event of events) {
            if (event.type === 'add_bot') {
                const b = addAtom(null, bot(event.id)) as Atom<BotOp>;
                const botNode = this._weave.getNode(b.id) as WeaveNode<BotOp>;
                updateTags(botNode, event.bot.tags);
            } else if (event.type === 'update_bot') {
                if (!event.update.tags) {
                    continue;
                }

                const node = findBotNode(this._weave, event.id);
                if (node) {
                    updateTags(node, event.update.tags);
                }
            } else if (event.type == 'remove_bot') {
                const node = findBotNode(this._weave, event.id);
                if (node) {
                    addAtom(node.atom, del(), 1);
                }
            }
        }

        const prevState = this._state;
        this._state = apply(prevState, stateUpdate);
        const update = updates(prevState, stateUpdate);

        if (update.addedBots.length > 0) {
            this._onBotsAdded.next(update.addedBots);
        }
        if (update.removedBots.length > 0) {
            this._onBotsRemoved.next(update.removedBots);
        }
        if (update.updatedBots.length > 0) {
            this._onBotsUpdated.next(
                update.updatedBots.map(u => ({
                    bot: <any>u.bot,
                    tags: [...u.tags.values()],
                }))
            );
        }
    }
}

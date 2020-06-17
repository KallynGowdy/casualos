import { testPartitionImplementation } from './test/PartitionTests';
import { OtherPlayersPartitionImpl } from './OtherPlayersPartition';
import {
    MemoryConnectionClient,
    ADD_ATOMS,
    AddAtomsEvent,
    atom,
    atomId,
    ReceiveDeviceActionEvent,
    RECEIVE_EVENT,
    remote,
    SEND_EVENT,
    WATCH_BRANCH_DEVICES,
    ConnectedToBranchEvent,
    DisconnectedFromBranchEvent,
    DEVICE_CONNECTED_TO_BRANCH,
    DEVICE_DISCONNECTED_FROM_BRANCH,
    deviceInfo,
    WATCH_BRANCH,
    UNWATCH_BRANCH,
} from '@casual-simulation/causal-trees';
import { CausalRepoClient } from '@casual-simulation/causal-trees/core2';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { Bot, UpdatedBot, createBot, botAdded } from '../bots';
import { OtherPlayersRepoPartitionConfig } from './AuxPartitionConfig';
import { bot, tag, value, del } from '../aux-format-2';
import { waitAsync, wait } from '../test/TestHelpers';
import { takeWhile, bufferCount } from 'rxjs/operators';

console.log = jest.fn();

describe('OtherPlayersPartition', () => {
    describe('connection', () => {
        let connection: MemoryConnectionClient;
        let client: CausalRepoClient;
        let partition: OtherPlayersPartitionImpl;
        let receiveEvent: Subject<ReceiveDeviceActionEvent>;
        let addAtoms: Subject<AddAtomsEvent>;
        let deviceConnected: Subject<ConnectedToBranchEvent>;
        let deviceDisconnected: Subject<DisconnectedFromBranchEvent>;
        let added: Bot[];
        let removed: string[];
        let updated: UpdatedBot[];
        let sub: Subscription;

        let device1 = deviceInfo('device1', 'device1Id', 'device1SessionId');

        beforeEach(async () => {
            connection = new MemoryConnectionClient();
            receiveEvent = new Subject<ReceiveDeviceActionEvent>();
            addAtoms = new Subject<AddAtomsEvent>();
            deviceConnected = new Subject();
            deviceDisconnected = new Subject();
            connection.events.set(RECEIVE_EVENT, receiveEvent);
            connection.events.set(ADD_ATOMS, addAtoms);
            connection.events.set(DEVICE_CONNECTED_TO_BRANCH, deviceConnected);
            connection.events.set(
                DEVICE_DISCONNECTED_FROM_BRANCH,
                deviceDisconnected
            );
            client = new CausalRepoClient(connection);
            connection.connect();
            sub = new Subscription();

            added = [];
            removed = [];
            updated = [];

            setupPartition({
                type: 'other_players_repo',
                branch: 'testBranch',
                host: 'testHost',
            });
        });

        afterEach(() => {
            sub.unsubscribe();
        });

        it('should return delayed for the realtimeStrategy', () => {
            expect(partition.realtimeStrategy).toEqual('delayed');
        });

        it('should issue connection, authentication, authorization, and sync events in that order', async () => {
            const promise = partition.onStatusUpdated
                .pipe(
                    takeWhile(update => update.type !== 'sync', true),
                    bufferCount(4)
                )
                .toPromise();

            partition.connect();

            deviceConnected.next({
                branch: {
                    branch: 'testBranch',
                },
                device: device1,
            });

            const update = await promise;

            expect(update).toEqual([
                {
                    type: 'connection',
                    connected: true,
                },
                expect.objectContaining({
                    type: 'authentication',
                    authenticated: true,
                }),
                expect.objectContaining({
                    type: 'authorization',
                    authorized: true,
                }),
                {
                    type: 'sync',
                    synced: true,
                },
            ]);
        });

        describe('remote events', () => {
            it('should not send the remote event to the server', async () => {
                await partition.sendRemoteEvents([
                    remote(
                        {
                            type: 'def',
                        },
                        {
                            deviceId: 'device',
                        }
                    ),
                ]);

                expect(connection.sentMessages).toEqual([]);
            });
        });

        describe('other_players', () => {
            it('should watch for other devices', async () => {
                partition.connect();

                await waitAsync();

                expect(connection.sentMessages).toEqual([
                    {
                        name: WATCH_BRANCH_DEVICES,
                        data: 'testBranch',
                    },
                ]);
            });

            it('should watch the branch for the given player', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                expect(connection.sentMessages.slice(1)).toEqual([
                    {
                        name: WATCH_BRANCH,
                        data: {
                            branch: 'testBranch-player-device1SessionId',
                            temporary: true,
                        },
                    },
                ]);
            });

            it('should add bots from the new players branch', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                const state = partition.state;

                const bot1 = atom(atomId('device1', 1), null, bot('test1'));
                const tag1 = atom(atomId('device1', 2), bot1, tag('abc'));
                const value1 = atom(atomId('device1', 3), tag1, value('def'));

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [bot1, tag1, value1],
                });

                await waitAsync();

                expect(added).toEqual([
                    createBot('test1', {
                        abc: 'def',
                    }),
                ]);
                expect(partition.state).toEqual({
                    test1: createBot('test1', {
                        abc: 'def',
                    }),
                });

                // Should make a new state object on updates.
                // This is because AuxHelper expects this in order for its caching to work properly.
                expect(partition.state).not.toBe(state);
            });

            it('should remove bots from the new players branch', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                const state = partition.state;

                const bot1 = atom(atomId('device1', 1), null, bot('test1'));
                const tag1 = atom(atomId('device1', 2), bot1, tag('abc'));
                const value1 = atom(atomId('device1', 3), tag1, value('def'));
                const del1 = atom(atomId('device1', 4), bot1, del());

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [bot1, tag1, value1],
                });

                await waitAsync();

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [del1],
                });

                expect(removed).toEqual(['test1']);
                expect(partition.state).toEqual({});

                // Should make a new state object on updates.
                // This is because AuxHelper expects this in order for its caching to work properly.
                expect(partition.state).not.toBe(state);
            });

            it('should update bots on the new players branch', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                const state = partition.state;

                const bot1 = atom(atomId('device1', 1), null, bot('test1'));
                const tag1 = atom(atomId('device1', 2), bot1, tag('abc'));
                const value1 = atom(atomId('device1', 3), tag1, value('def'));
                const value2 = atom(atomId('device1', 4), tag1, value('ghi'));

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [bot1, tag1, value1],
                });

                await waitAsync();

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [value2],
                });

                expect(updated).toEqual([
                    {
                        bot: createBot('test1', {
                            abc: 'ghi',
                        }),
                        tags: ['abc'],
                    },
                ]);
                expect(partition.state).toEqual({
                    test1: createBot('test1', {
                        abc: 'ghi',
                    }),
                });

                // Should make a new state object on updates.
                // This is because AuxHelper expects this in order for its caching to work properly.
                expect(partition.state).not.toBe(state);
            });

            it('should stop watching the player branch when the devicec disconnects', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                deviceDisconnected.next({
                    branch: 'testBranch',
                    device: device1,
                });

                await waitAsync();

                expect(connection.sentMessages.slice(1)).toEqual([
                    {
                        name: WATCH_BRANCH,
                        data: {
                            branch: 'testBranch-player-device1SessionId',
                            temporary: true,
                        },
                    },
                    {
                        name: UNWATCH_BRANCH,
                        data: 'testBranch-player-device1SessionId',
                    },
                ]);
            });

            it('should remove all the bots that were part of the player branch when the device disconnects', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                const bot1 = atom(atomId('device1', 1), null, bot('test1'));
                const tag1 = atom(atomId('device1', 2), bot1, tag('abc'));
                const value1 = atom(atomId('device1', 3), tag1, value('def'));

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [bot1, tag1, value1],
                });

                await waitAsync();

                deviceDisconnected.next({
                    branch: 'testBranch',
                    device: device1,
                });

                await waitAsync();

                expect(removed).toEqual(['test1']);
                expect(partition.state).toEqual({});
            });

            it('should do nothing when given a bot event', async () => {
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                const extra = await partition.applyEvents([
                    botAdded(
                        createBot('test1', {
                            abc: 'def',
                        })
                    ),
                ]);

                await waitAsync();

                expect(extra).toEqual([]);
                expect(added).toEqual([]);
                expect(partition.state).toEqual({});
            });

            it('should ignore devices that are the same user as the partition', async () => {
                partition.connect();

                await waitAsync();
                const userDevice = deviceInfo('username', 'username', 'test');

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: userDevice,
                });

                await waitAsync();

                expect(connection.sentMessages.slice(1)).toEqual([]);
            });

            it('should ignore the server user', async () => {
                partition.connect();

                await waitAsync();
                const serverDevice = deviceInfo('Server', 'Server', 'server');

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: serverDevice,
                });

                await waitAsync();

                expect(connection.sentMessages.slice(1)).toEqual([]);
            });

            it('should use the specified space', async () => {
                partition.space = 'test';
                partition.connect();

                await waitAsync();

                deviceConnected.next({
                    branch: {
                        branch: 'testBranch',
                    },
                    device: device1,
                });

                await waitAsync();

                const state = partition.state;

                const bot1 = atom(atomId('device1', 1), null, bot('test1'));
                const tag1 = atom(atomId('device1', 2), bot1, tag('abc'));
                const value1 = atom(atomId('device1', 3), tag1, value('def'));

                addAtoms.next({
                    branch: 'testBranch-player-device1SessionId',
                    atoms: [bot1, tag1, value1],
                });

                await waitAsync();

                expect(added).toEqual([
                    createBot(
                        'test1',
                        {
                            abc: 'def',
                        },
                        <any>'test'
                    ),
                ]);
                expect(partition.state).toEqual({
                    test1: createBot(
                        'test1',
                        {
                            abc: 'def',
                        },
                        <any>'test'
                    ),
                });

                // Should make a new state object on updates.
                // This is because AuxHelper expects this in order for its caching to work properly.
                expect(partition.state).not.toBe(state);
            });
        });

        function setupPartition(config: OtherPlayersRepoPartitionConfig) {
            partition = new OtherPlayersPartitionImpl(
                {
                    id: 'test',
                    name: 'name',
                    token: 'token',
                    username: 'username',
                },
                client,
                config
            );

            sub.add(partition);
            sub.add(partition.onBotsAdded.subscribe(b => added.push(...b)));
            sub.add(partition.onBotsRemoved.subscribe(b => removed.push(...b)));
            sub.add(partition.onBotsUpdated.subscribe(b => updated.push(...b)));
        }
    });
});

import { testPartitionImplementation } from './test/PartitionTests';
import { RemoteCausalRepoPartitionImpl } from './RemoteCausalRepoPartition';
import { BehaviorSubject, Subject } from 'rxjs';
import {
    Atom,
    atom,
    atomId,
    ADD_ATOMS,
    AddAtomsEvent,
    MemoryConnectionClient,
    CausalRepoClient,
    SEND_EVENT,
    ReceiveDeviceActionEvent,
    RECEIVE_EVENT,
    RemoveAtomsEvent,
    REMOVE_ATOMS,
} from '@casual-simulation/causal-trees/core2';
import {
    remote,
    DeviceAction,
    device,
    deviceInfo,
} from '@casual-simulation/causal-trees';
import flatMap from 'lodash/flatMap';
import { waitAsync } from '../test/TestHelpers';
import { botAdded, createBot } from '@casual-simulation/aux-common';
import { AuxOpType } from '@casual-simulation/aux-common/aux-format-2';

describe('RemoteCausalRepoPartition', () => {
    testPartitionImplementation(async () => {
        const connection = new MemoryConnectionClient();
        const addAtoms = new BehaviorSubject<AddAtomsEvent>({
            branch: 'testBranch',
            atoms: [atom(atomId('a', 1), null, {})],
        });
        connection.events.set(ADD_ATOMS, addAtoms);

        const client = new CausalRepoClient(connection);
        connection.connect();

        return new RemoteCausalRepoPartitionImpl(
            {
                id: 'test',
                name: 'name',
                token: 'token',
                username: 'username',
            },
            client,
            {
                type: 'remote_causal_repo',
                branch: 'testBranch',
                host: 'testHost',
            }
        );
    });

    describe('connection', () => {
        let connection: MemoryConnectionClient;
        let client: CausalRepoClient;
        let partition: RemoteCausalRepoPartitionImpl;
        let receiveEvent: Subject<ReceiveDeviceActionEvent>;
        let removeAtoms: Subject<RemoveAtomsEvent>;

        beforeEach(async () => {
            connection = new MemoryConnectionClient();
            receiveEvent = new Subject<ReceiveDeviceActionEvent>();
            removeAtoms = new Subject<RemoveAtomsEvent>();
            connection.events.set(RECEIVE_EVENT, receiveEvent);
            connection.events.set(REMOVE_ATOMS, removeAtoms);
            client = new CausalRepoClient(connection);
            connection.connect();

            partition = new RemoteCausalRepoPartitionImpl(
                {
                    id: 'test',
                    name: 'name',
                    token: 'token',
                    username: 'username',
                },
                client,
                {
                    type: 'remote_causal_repo',
                    branch: 'testBranch',
                    host: 'testHost',
                }
            );
        });

        describe('remote events', () => {
            it('should send the remote event to the server', async () => {
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

                expect(connection.sentMessages).toEqual([
                    {
                        name: SEND_EVENT,
                        data: {
                            branch: 'testBranch',
                            action: remote(
                                {
                                    type: 'def',
                                },
                                {
                                    deviceId: 'device',
                                }
                            ),
                        },
                    },
                ]);
            });

            it('should listen for device events from the connection', async () => {
                let events = [] as DeviceAction[];
                partition.onEvents.subscribe(e => events.push(...e));

                const action = device(
                    deviceInfo('username', 'device', 'session'),
                    {
                        type: 'abc',
                    }
                );
                partition.connect();

                receiveEvent.next({
                    branch: 'testBranch',
                    action: action,
                });

                await waitAsync();

                expect(events).toEqual([action]);
            });
        });

        describe('remove atoms', () => {
            it('should remove the given atoms from the tree', async () => {
                partition.connect();

                await partition.applyEvents([
                    botAdded(
                        createBot('newBot', {
                            abc: 'def',
                        })
                    ),
                ]);

                const addedAtoms = flatMap(
                    connection.sentMessages.filter(m => m.name === ADD_ATOMS),
                    m => m.data.atoms
                );
                const newBotAtom = addedAtoms.find(
                    a =>
                        a.value.type === AuxOpType.bot &&
                        a.value.id === 'newBot'
                );

                removeAtoms.next({
                    branch: 'testBranch',
                    hashes: [newBotAtom.hash],
                });

                await waitAsync();

                expect(partition.state['newBot']).toBeUndefined();
            });
        });
    });
});

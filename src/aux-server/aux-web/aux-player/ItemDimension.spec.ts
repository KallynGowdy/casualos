import { createBot } from '@casual-simulation/aux-common';
import { waitAsync } from '@casual-simulation/aux-common/test/TestHelpers';
import { waitForSync } from '@casual-simulation/aux-vm';
import { Simulation, SimulationManager } from '@casual-simulation/aux-vm';
import { nodeSimulationWithConfig } from '@casual-simulation/aux-vm-node';
import { ItemDimension } from './ItemDimension';

console.log = jest.fn();

describe('ItemDimension', () => {
    let simulationManager: SimulationManager<Simulation>;

    beforeEach(() => {
        simulationManager = new SimulationManager<Simulation>((id) =>
            nodeSimulationWithConfig(
                {
                    id: 'user',
                    name: 'user',
                    token: 'token',
                    username: 'username',
                },
                id,
                {
                    config: {
                        version: 'v1.0.0',
                        versionHash: 'hash',
                    },
                    partitions: {
                        shared: {
                            type: 'memory',
                            initialState: {
                                test1: createBot('test1', {
                                    menu: true,
                                }),
                                test2: createBot('test2', {
                                    menu: true,
                                    other: true,
                                }),
                                test3: createBot('test3', {
                                    other: true,
                                }),
                                user: createBot('user', {}),
                            },
                        },
                    },
                }
            )
        );
    });

    it('should keep bots that are in both dimensions', async () => {
        const dim = new ItemDimension(simulationManager, ['menuPortal']);

        const sim = await simulationManager.addSimulation('test');
        sim.helper.userId = 'user';

        await waitForSync(sim);

        await sim.helper.updateBot(sim.helper.botsState['user'], {
            tags: {
                menuPortal: 'menu',
            },
        });

        await waitAsync();

        expect(dim.items.length).toEqual(2);

        await sim.helper.updateBot(sim.helper.botsState['user'], {
            tags: {
                menuPortal: 'other',
            },
        });

        await waitAsync();

        expect(dim.items.length).toEqual(2);
    });
});
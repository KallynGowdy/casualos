import { testPartitionImplementation } from '@casual-simulation/aux-common/partitions/test/PartitionTests';
import { LocalStoragePartitionImpl } from './LocalStoragePartition';
import {
    Bot,
    botAdded,
    botUpdated,
    createBot,
    StateUpdatedEvent,
} from '@casual-simulation/aux-common';
import { skip } from 'rxjs/operators';
import { waitAsync } from '@casual-simulation/aux-common/test/TestHelpers';

describe('LocalStoragePartition', () => {
    beforeAll(() => {
        polyfillEventListenerFunctions();
    });

    beforeEach(() => {
        mockLocalStorage();
    });

    afterEach(() => {
        resetLocalStorage();
    });

    testPartitionImplementation(async () => {
        return new LocalStoragePartitionImpl({
            type: 'local_storage',
            namespace: 'namespace',
        });
    });

    describe('connect', () => {
        it('should send an onBotsAdded event for all the bots in the partition on init', async () => {
            const mem = new LocalStoragePartitionImpl({
                type: 'local_storage',
                namespace: 'namespace',
            });

            await mem.applyEvents([
                botAdded(createBot('test')),
                botAdded(createBot('test2')),
            ]);

            let added: Bot[] = [];
            mem.onBotsAdded.subscribe((e) => added.push(...e));

            expect(added).toEqual([createBot('test'), createBot('test2')]);
        });

        it('should return immediate for the editStrategy', () => {
            const mem = new LocalStoragePartitionImpl({
                type: 'local_storage',
                namespace: 'namespace',
            });

            expect(mem.realtimeStrategy).toEqual('immediate');
        });
    });

    describe('storage', () => {
        let partition: LocalStoragePartitionImpl;

        beforeEach(() => {
            partition = new LocalStoragePartitionImpl({
                type: 'local_storage',
                namespace: 'name/space',
            });
            partition.space = 'local';
        });

        it('should store new bots in the given namespace', async () => {
            await partition.applyEvents([
                botAdded(createBot('test')),
                botAdded(createBot('test2')),
            ]);

            const data = getStoredData();

            expect(data).toEqual([
                ['name/space/test', createBot('test', {}, 'local')],
                ['name/space/test2', createBot('test2', {}, 'local')],
            ]);
        });

        it('should store updated bots in the given namespace', async () => {
            await partition.applyEvents([
                botAdded(createBot('test')),
                botAdded(createBot('test2')),
            ]);

            await partition.applyEvents([
                botUpdated('test', {
                    tags: {
                        abc: 'def',
                    },
                }),
            ]);

            const data = getStoredData();

            expect(data).toEqual([
                [
                    'name/space/test',
                    createBot(
                        'test',
                        {
                            abc: 'def',
                        },
                        'local'
                    ),
                ],
                ['name/space/test2', createBot('test2', {}, 'local')],
            ]);
        });

        it('should store updated tag masks in the given namespace', async () => {
            await partition.applyEvents([
                botAdded(createBot('test')),
                botAdded(createBot('test2')),
            ]);

            await partition.applyEvents([
                botUpdated('test', {
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                }),
            ]);

            const data = getStoredData();

            expect(data).toEqual([
                [
                    'name/space/test',
                    {
                        id: 'test',
                        space: 'local',
                        tags: {},
                        masks: {
                            local: {
                                abc: 'def',
                            },
                        },
                    },
                ],
                ['name/space/test2', createBot('test2', {}, 'local')],
            ]);
        });

        it('should store updated tag masks for bots in other spaces', async () => {
            await partition.applyEvents([
                botUpdated('test', {
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                }),
            ]);

            const data = getStoredData();

            expect(data).toEqual([
                [
                    'name/space/test',
                    {
                        masks: {
                            local: {
                                abc: 'def',
                            },
                        },
                    },
                ],
            ]);
        });

        it('should load tag masks from local storage when connect() is called', async () => {
            globalThis.localStorage.setItem(
                'name/space/test',
                JSON.stringify({
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                })
            );

            const updates = [] as StateUpdatedEvent[];
            partition.onStateUpdated
                .pipe(skip(1))
                .subscribe((u) => updates.push(u));
            partition.connect();

            await waitAsync();

            expect(partition.state).toEqual({
                test: {
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                },
            });
            expect(updates).toEqual([
                {
                    state: {
                        test: {
                            masks: {
                                local: {
                                    abc: 'def',
                                },
                            },
                        },
                    },
                    addedBots: [],
                    removedBots: [],
                    updatedBots: ['test'],
                },
            ]);
        });

        it('should respond to when a bots tag masks are updated via storage', async () => {
            const updates = [] as StateUpdatedEvent[];
            partition.onStateUpdated
                .pipe(skip(1))
                .subscribe((u) => updates.push(u));
            partition.connect();

            sendStorageEvent(
                'name/space/test',
                JSON.stringify({
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                }),
                null
            );

            await waitAsync();

            expect(partition.state).toEqual({
                test: {
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                },
            });
            expect(updates).toEqual([
                {
                    state: {
                        test: {
                            masks: {
                                local: {
                                    abc: 'def',
                                },
                            },
                        },
                    },
                    addedBots: [],
                    removedBots: [],
                    updatedBots: ['test'],
                },
            ]);
        });

        it('should support when a tag is removed via storage', async () => {
            partition.connect();
            await partition.applyEvents([
                botAdded(
                    createBot('test', {
                        abc: 'def',
                    })
                ),
            ]);

            await waitAsync();

            const updates = [] as StateUpdatedEvent[];
            partition.onStateUpdated
                .pipe(skip(1))
                .subscribe((u) => updates.push(u));

            sendStorageEvent(
                'name/space/test',
                JSON.stringify(createBot('test')),
                JSON.stringify(
                    createBot('test', {
                        abc: 'def',
                    })
                )
            );

            await waitAsync();

            expect(partition.state).toEqual({
                test: createBot('test', {}, 'local'),
            });
            expect(updates).toEqual([
                {
                    state: {
                        test: {
                            tags: {
                                abc: null,
                            },
                        },
                    },
                    addedBots: [],
                    removedBots: [],
                    updatedBots: ['test'],
                },
            ]);
        });

        it('should support when a tag mask is removed via storage', async () => {
            partition.connect();
            await partition.applyEvents([
                botUpdated('test', {
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                }),
            ]);

            await waitAsync();

            const updates = [] as StateUpdatedEvent[];
            partition.onStateUpdated
                .pipe(skip(1))
                .subscribe((u) => updates.push(u));

            sendStorageEvent(
                'name/space/test',
                JSON.stringify({
                    masks: {
                        local: {},
                    },
                }),
                JSON.stringify({
                    masks: {
                        local: {
                            abc: 'def',
                        },
                    },
                })
            );

            await waitAsync();

            expect(partition.state).toEqual({
                test: {
                    masks: {
                        local: {},
                    },
                },
            });
            expect(updates).toEqual([
                {
                    state: {
                        test: {
                            masks: {
                                local: {
                                    abc: null,
                                },
                            },
                        },
                    },
                    addedBots: [],
                    removedBots: [],
                    updatedBots: ['test'],
                },
            ]);
        });
    });
});

function getStoredData(): [string, any][] {
    let data = [] as any[];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
        const key = globalThis.localStorage.key(i);
        data.push([key, JSON.parse(globalThis.localStorage.getItem(key))]);
    }
    return data;
}

const originalLocalStorage = globalThis.localStorage;

function mockLocalStorage() {
    useLocalStorage(new LocalStorage());
}

function resetLocalStorage() {
    useLocalStorage(originalLocalStorage);
}

function useLocalStorage(storage: typeof globalThis.localStorage) {
    globalThis.localStorage = storage;
}

class LocalStorage {
    private _data = new Map<string, string>();

    get length() {
        return this._data.size;
    }

    key(index: number) {
        return [...this._data.keys()][index];
    }

    getItem(key: string): string {
        return this._data.get(key) || null;
    }

    setItem(key: string, data: string): void {
        this._data.set(key, data);
    }

    removeItem(key: string): void {
        this._data.delete(key);
    }

    clear() {
        this._data.clear();
    }

    use() {
        globalThis.localStorage = this;
    }
}

interface StorageEventInitDict extends EventInit {
    key: string;
    newValue: string;
    oldValue: string;
}

class StorageEvent {
    type: string;
    key: string;
    newValue: string;
    oldValue: string;

    constructor(type: string, eventInitDict: StorageEventInitDict) {
        this.type = type;
        this.key = eventInitDict.key;
        this.newValue = eventInitDict.newValue;
        this.oldValue = eventInitDict.oldValue;
    }
}

function sendStorageEvent(key: string, newValue: string, oldValue: string) {
    let event = new StorageEvent('storage', {
        key,
        newValue,
        oldValue,
    });

    for (let listener of storageListeners) {
        listener(event);
    }
}

let storageListeners = [] as any[];

function polyfillEventListenerFunctions() {
    if (typeof globalThis.addEventListener === 'undefined') {
        globalThis.addEventListener = (event: string, listener: any) => {
            if (event === 'storage') {
                storageListeners.push(listener);
            }
        };
    }

    if (typeof globalThis.removeEventListener === 'undefined') {
        globalThis.removeEventListener = (event: string, listener: any) => {
            if (event === 'storage') {
                let index = storageListeners.indexOf(listener);
                if (index >= 0) {
                    storageListeners.splice(index, 1);
                }
            }
        };
    }
}

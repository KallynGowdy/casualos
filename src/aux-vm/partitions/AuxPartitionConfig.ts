import { BotsState, AuxCausalTree } from '@casual-simulation/aux-common';
import { User } from '@casual-simulation/causal-trees';

/**
 * Defines a set of options for configuring partitioning of bots.
 * Bot IDs are mapped to
 */
export interface AuxPartitionConfig {
    '*': PartitionConfig;
    [key: string]: PartitionConfig;
}

/**
 * Defines a partition config.
 * That is, a config which specifies how to build a partition.
 */
export type PartitionConfig =
    | RemoteCausalTreePartitionConfig
    | CausalTreePartitionConfig
    | CausalTree2PartitionConfig
    | RemoteCausalTree2PartitionConfig
    | MemoryPartitionConfig;

/**
 * Defines a memory partition.
 * That is, a configuration that specifies that bots should be stored in memory.
 */
export interface MemoryPartitionConfig {
    type: 'memory';

    /**
     * The initial state for the memory partition.
     */
    initialState: BotsState;
}

/**
 * Defines a causal tree partition.
 * That is, a configuration that specifies that bots should be stored in a causal tree.
 */
export interface CausalTreePartitionConfig {
    type: 'causal_tree';

    /**
     * The tree to use.
     */
    tree: AuxCausalTree;

    /**
     * The ID of the tree.
     */
    id: string;
}

/**
 * Defines a causal tree partition that uses the new Causal Tree API.
 */
export interface CausalTree2PartitionConfig {
    type: 'causal_tree_2';
}

/**
 * Defines a remote causal tree partition.
 * That is, a configuration that specifies that bots should be stored in a causal tree
 * which is loaded from a remote server.
 */
export interface RemoteCausalTreePartitionConfig {
    type: 'remote_causal_tree';

    /**
     * The ID of the tree.
     */
    id: string;

    /**
     * The host that should be connected to.
     */
    host: string;

    /**
     * The name of the tree to load.
     */
    treeName: string;
}

/**
 * Defines a remote causal tree 2 partition.
 * That is, a configuration that specifies that bots should be stored in a v2 causal tree
 * which is loaded from a remote server.
 */
export interface RemoteCausalTree2PartitionConfig {
    type: 'remote_causal_tree_2';

    /**
     * The branch name to load.
     */
    branch: string;

    /**
     * The host that should be connected to.
     */
    host: string;
}

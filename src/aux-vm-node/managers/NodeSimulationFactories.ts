import {
    AuxCausalTree,
    FormulaLibraryOptions,
    parseSimulationId,
} from '@casual-simulation/aux-common';
import { AuxUser, getTreeName } from '@casual-simulation/aux-vm';
import { NodeSimulation } from './NodeSimulation';
import { NodeAuxChannel } from '../vm/NodeAuxChannel';
import { getSandbox } from '../vm/VM2Sandbox';
import {
    NullCausalTreeStore,
    DeviceInfo,
} from '@casual-simulation/causal-trees';
import { NodeSigningCryptoImpl } from '@casual-simulation/crypto-node';
import {
    RemoteAuxChannel,
    RemoteSimulation,
    RemoteSimulationImpl,
} from '@casual-simulation/aux-vm-client';
import { AuxVMNode } from '../vm/AuxVMNode';
import { CausalRepoClient } from '@casual-simulation/causal-trees/core2';
import { AuxConfig } from '@casual-simulation/aux-vm/vm';
import { AuxPartitionConfig } from '@casual-simulation/aux-vm/partitions';

/**
 * Creates a new NodeSimulation for the given AuxCausalTree using the given user, channel ID, and config.
 */
export function nodeSimulationFromTree(
    tree: AuxCausalTree,
    user: AuxUser,
    device: DeviceInfo,
    id: string,
    config: FormulaLibraryOptions['config']
): NodeSimulation {
    return new NodeSimulation(
        id,
        config,
        {
            '*': {
                type: 'causal_tree',
                id: id,
                tree: tree,
            },
        },
        cfg => new NodeAuxChannel(tree, user, device, cfg)
    );
}

/**
 * Creates a new NodeSimulation which interfaces with a remote server as the given user to load the channel with the given ID using the given config.
 * @param host The host to interface with.
 * @param user The user.
 * @param id The ID of the channel to load.
 * @param config The config.
 */
export function nodeSimulationForRemote(
    host: string,
    user: AuxUser,
    id: string,
    config: FormulaLibraryOptions['config']
): RemoteSimulation {
    const parsedId = parseSimulationId(id);
    return new RemoteSimulationImpl(
        id,
        config,
        {
            '*': {
                type: 'remote_causal_tree',
                host: host,
                id: id,
                treeName: getTreeName(parsedId.channel),
            },
        },
        cfg =>
            new AuxVMNode(
                new RemoteAuxChannel(user, cfg, {
                    sandboxFactory: lib => getSandbox(lib),
                    partitionOptions: {
                        defaultHost: host,
                        store: new NullCausalTreeStore(),
                        crypto: new NodeSigningCryptoImpl(
                            'ECDSA-SHA256-NISTP256'
                        ),
                    },
                })
            )
    );
}

export function nodeSimulationForBranch(
    user: AuxUser,
    client: CausalRepoClient,
    branch: string
) {
    return new RemoteSimulationImpl(
        branch,
        null,
        {
            '*': {
                type: 'causal_repo_client',
                branch: branch,
                client: client,
            },
        },
        cfg =>
            new AuxVMNode(
                new RemoteAuxChannel(user, cfg, {
                    sandboxFactory: lib => getSandbox(lib),
                })
            )
    );
}

export function nodeSimulationForLocalRepo(user: AuxUser, id: string) {
    return new RemoteSimulationImpl(
        id,
        null,
        {
            '*': {
                type: 'causal_repo',
            },
        },
        cfg =>
            new AuxVMNode(
                new RemoteAuxChannel(user, cfg, {
                    sandboxFactory: lib => getSandbox(lib),
                })
            )
    );
}

export function nodeSimulationWithConfig(
    user: AuxUser,
    id: string,
    config: AuxConfig
) {
    return new RemoteSimulationImpl(
        id,
        config.config,
        config.partitions,
        cfg =>
            new AuxVMNode(
                new RemoteAuxChannel(user, cfg, {
                    sandboxFactory: lib => getSandbox(lib),
                })
            )
    );
}

import { RealtimeChannelInfo } from '@casual-simulation/causal-trees';
import { DeviceConnection } from './DeviceConnection';
import { DeviceChannelConnection } from './DeviceChannelConnection';

/**
 * Defines an interface for objects that assist causal tree servers with managing causal trees.
 */
export interface CausalTreeServer {
    /**
     * Registers a function that should be called whenever a causal tree is loaded.
     * The function should return a list of subscriptions that should be disposed when the tree is disposed.
     *
     * @param listener The listener to register.
     */
    // whileCausalTreeLoaded<TTree extends CausalTree<AtomOp, any, any>>(
    //     listener: (tree: TTree, id: string) => SubscriptionLike[]
    // ): SubscriptionLike;

    /**
     * Gets the list of connected devices.
     */
    connectedDevices: DeviceConnection<any>[];

    /**
     * Gets the list of channels that are currently active.
     */
    activeChannels: RealtimeChannelInfo[];

    /**
     * Gets the list of channels that the given device is connected to.
     * @param device The device.
     */
    getConnectedChannels(
        device: DeviceConnection<any>
    ): DeviceChannelConnection[];

    /**
     * Gets the list of devices that are connected to the given channel.
     * @param info The info about the channel.
     */
    getConnectedDevices(info: RealtimeChannelInfo): DeviceConnection<any>[];

    /**
     * Indicates to the helper that a device with the given ID connected to the server.
     * @param deviceId The ID of the device that connected.
     */
    connectDevice<TExtra>(
        deviceId: string,
        extra?: TExtra
    ): Promise<DeviceConnection<TExtra>>;

    /**
     * Indicates to the helper that the given device has become disconnected.
     * @param device The device.
     */
    disconnectDevice<TExtra>(device: DeviceConnection<TExtra>): void;

    /**
     * Joins the given device to the given channel.
     * @param device The device to join to the channel.
     * @param info The channel to connect to.
     */
    joinChannel<TExtra>(
        device: DeviceConnection<TExtra>,
        info: RealtimeChannelInfo
    ): Promise<DeviceChannelConnection>;

    /**
     * Disconnects the given device from the given channel.
     * @param device The device.
     * @param info The channel to leave.
     */
    leaveChannel<TExtra>(
        device: DeviceConnection<TExtra>,
        info: RealtimeChannelInfo
    ): Promise<void>;
}

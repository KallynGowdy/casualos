import {
    ChannelAuthorizer,
    LoadedChannel,
} from '@casual-simulation/causal-tree-server';
import {
    USERNAME_CLAIM,
    USER_ROLE,
    ADMIN_ROLE,
    DeviceInfo,
} from '@casual-simulation/causal-trees';
import {
    createCalculationContext,
    getActiveObjects,
    whitelistOrBlacklistAllowsAccess,
    File,
    GLOBALS_FILE_ID,
    getFileStringList,
} from '@casual-simulation/aux-common';
import formulaLib from '@casual-simulation/aux-common/Formulas/formula-lib';
import { VM2Sandbox } from '@casual-simulation/aux-vm-node';
import { difference, intersection } from 'lodash';

export class AuxUserAuthorizer implements ChannelAuthorizer {
    isAllowedAccess(device: DeviceInfo, channel: LoadedChannel): boolean {
        if (channel.info.type !== 'aux') {
            throw new Error('Channel type must be "aux"');
        }

        if (!device) {
            return false;
        }

        if (this._isAdmin(device)) {
            return true;
        }

        if (!this._isUser(device)) {
            return false;
        }

        const objects = getActiveObjects(channel.tree.value);
        const globalsFile: File = channel.tree.value[GLOBALS_FILE_ID];

        if (!globalsFile) {
            return true;
        }

        const calc = createCalculationContext(
            objects,
            undefined,
            formulaLib,
            lib => new VM2Sandbox(lib)
        );
        const username = device.claims[USERNAME_CLAIM];

        if (!whitelistOrBlacklistAllowsAccess(calc, globalsFile, username)) {
            return false;
        }

        const whitelist =
            getFileStringList(calc, globalsFile, 'aux.whitelist.roles') || [];
        const blacklist =
            getFileStringList(calc, globalsFile, 'aux.blacklist.roles') || [];

        const missingRoles = difference(whitelist, device.roles);
        if (missingRoles.length > 0) {
            return false;
        }

        const bannedRoles = intersection(blacklist, device.roles);
        if (bannedRoles.length > 0) {
            return false;
        }

        return true;
    }

    private _isAdmin(device: DeviceInfo) {
        return device.roles.indexOf(ADMIN_ROLE) >= 0;
    }

    private _isUser(device: DeviceInfo) {
        return device.roles.indexOf(USER_ROLE) >= 0;
    }
}

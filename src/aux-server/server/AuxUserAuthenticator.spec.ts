import { AuxUserAuthenticator } from './AuxUserAuthenticator';
import {
    LoadedChannel,
    USERNAME_CLAIM,
    USER_ROLE,
    ADMIN_ROLE,
} from '@casual-simulation/causal-tree-server';
import { NodeSimulation } from '@casual-simulation/aux-vm-node';
import { AuxCausalTree, createFile } from '@casual-simulation/aux-common';
import { storedTree, site } from '@casual-simulation/causal-trees';
import uuid from 'uuid/v4';
import { Subscription } from 'rxjs';

const uuidMock: jest.Mock = <any>uuid;
jest.mock('uuid/v4');

console.log = jest.fn();

describe('AuxUserAuthenticator', () => {
    let authenticator: AuxUserAuthenticator;
    let tree: AuxCausalTree;
    let channel: LoadedChannel;
    beforeEach(async () => {
        tree = new AuxCausalTree(storedTree(site(1)));
        await tree.root();
        await tree.addFile(createFile('firstFile'));

        channel = {
            info: {
                id: 'test',
                type: 'aux',
            },
            subscription: new Subscription(),
            tree: tree,
        };

        authenticator = new AuxUserAuthenticator(channel);
    });

    it('should search the file state for a file with the given username', async () => {
        await tree.addFile(
            createFile('firstUser', {
                'aux.username': 'test',
                'aux.roles': [ADMIN_ROLE],
            })
        );

        await tree.addFile(
            createFile('firstToken', {
                'aux.token.username': 'test',
                'aux.token': 'abcdef',
            })
        );

        const info = await authenticator.authenticate({
            username: 'test',
            token: 'abcdef',
        });

        expect(info).toEqual({
            claims: {
                [USERNAME_CLAIM]: 'test',
            },
            roles: expect.arrayContaining([USER_ROLE, ADMIN_ROLE]),
        });
    });

    it('should add a file for the first user and give them the admin role', async () => {
        uuidMock.mockReturnValueOnce('testUser').mockReturnValueOnce('test');
        const info = await authenticator.authenticate({
            username: 'test',
            token: 'abcdef',
        });

        expect(tree.value['testUser']).toMatchObject({
            id: 'testUser',
            tags: {
                'aux.users': true,
                'aux.username': 'test',
                'aux.roles': [ADMIN_ROLE],
            },
        });

        expect(tree.value['test']).toMatchObject({
            id: 'test',
            tags: {
                'aux.tokens': true,
                'test.tokens': true,
                'aux.token.username': 'test',
                'aux.token': 'abcdef',
            },
        });

        expect(info).toEqual({
            claims: {
                [USERNAME_CLAIM]: 'test',
            },
            roles: expect.arrayContaining([USER_ROLE, ADMIN_ROLE]),
        });
    });

    it('should add a token for the user if the grant matches another token', async () => {
        await tree.addFile(
            createFile('userFile', {
                'aux.username': 'test',
                'aux.roles': [ADMIN_ROLE],
            })
        );

        await tree.addFile(
            createFile('tokenFile', {
                'aux.token.username': 'test',
                'aux.token': 'abc',
            })
        );

        uuidMock.mockReturnValue('test');
        const info = await authenticator.authenticate({
            username: 'test',
            token: 'other',
            grant: 'abc',
        });

        expect(tree.value['test']).toMatchObject({
            id: 'test',
            tags: {
                'aux.tokens': true,
                'test.tokens': true,
                'aux.token.username': 'test',
                'aux.token': 'other',
            },
        });

        expect(info).toEqual({
            claims: {
                [USERNAME_CLAIM]: 'test',
            },
            roles: expect.arrayContaining([USER_ROLE, ADMIN_ROLE]),
        });
    });

    it('should return null if the username matches but the token does not', async () => {
        await tree.addFile(
            createFile('userFile', {
                'aux.username': 'test',
                'aux.roles': [],
            })
        );

        await tree.addFile(
            createFile('tokenFile', {
                'aux.token.username': 'test',
                'aux.token': 'abcdef',
            })
        );

        const info = await authenticator.authenticate({
            username: 'test',
            token: 'doesNotMatch',
        });

        expect(info).toBe(null);
    });

    it('should reject devices which dont have a token', async () => {
        const info = await authenticator.authenticate({
            username: 'test',
            token: null,
        });

        expect(info).toBe(null);
    });

    it('should reject devices which dont have a username', async () => {
        const info = await authenticator.authenticate({
            username: null,
            token: 'abc',
        });

        expect(info).toBe(null);
    });
});

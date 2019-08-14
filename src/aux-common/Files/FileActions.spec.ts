import { goToContext } from './FileEvents';
import uuid from 'uuid/v4';
import { fileActionsTests } from './test/FileActionsTests';

const uuidMock: jest.Mock = <any>uuid;
jest.mock('uuid/v4');

describe('FileActions', () => {
    fileActionsTests(uuidMock);

    describe('goToContext()', () => {
        it('should use the first parameter as the context if only one argument is provided', () => {
            const event = goToContext('context');

            expect(event).toEqual({
                type: 'local',
                name: 'go_to_context',
                context: 'context',
            });
        });

        it('should ignore all other parameters', () => {
            const event = (<any>goToContext)('context', 'abc');

            expect(event).toEqual({
                type: 'local',
                name: 'go_to_context',
                context: 'context',
            });
        });
    });
});
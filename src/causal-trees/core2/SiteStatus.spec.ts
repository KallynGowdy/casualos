import { Weave } from './Weave2';
import { atom, atomId } from './Atom2';
import { updateSite, createAtom } from './SiteStatus';

describe('SiteStatus', () => {
    let weave: Weave<any>;
    beforeEach(() => {
        weave = new Weave();
    });

    describe('updateSite()', () => {
        describe('atoms from self', () => {
            it('should update the time on the site', () => {
                const current = {
                    id: 'test',
                    time: 0,
                };

                const a1 = atom(atomId('test', 1), null, {});

                const result = weave.insert(a1);

                const next = updateSite(current, result);

                expect(next).toEqual({
                    id: 'test',
                    time: 1,
                });
            });

            it('should choose the correct time from conflicts', () => {
                const cause1 = atom(atomId('1', 0), null, {});
                const cause2 = atom(atomId('2', 0), null, {});
                const atom1 = atom(atomId('test', 6), cause1, {});
                const atom2 = atom(atomId('test', 6), cause2, {});
                weave.insert(cause1);
                weave.insert(cause2);
                weave.insert(atom1);
                const result = weave.insert(atom2);

                // atom1 is the winner
                const current = {
                    id: 'test',
                    time: 0,
                };

                const next = updateSite(current, result);

                expect(next).toEqual({
                    id: 'test',
                    time: 6,
                });
            });
        });

        describe('atoms from others', () => {
            it('should increment the time by one for atoms from other sites', () => {
                const current = {
                    id: 'test',
                    time: 0,
                };

                const a1 = atom(atomId('a', 1), null, {});

                const result = weave.insert(a1);

                const next = updateSite(current, result);

                expect(next).toEqual({
                    id: 'test',
                    time: 2,
                });
            });

            it('should choose the correct time from conflicts', () => {
                const cause1 = atom(atomId('1', 0), null, {});
                const cause2 = atom(atomId('2', 0), null, {});
                const atom1 = atom(atomId('a', 6), cause1, {});
                const atom2 = atom(atomId('a', 6), cause2, {});
                weave.insert(cause1);
                weave.insert(cause2);
                weave.insert(atom1);
                const result = weave.insert(atom2);

                // atom1 is the winner
                const current = {
                    id: 'test',
                    time: 0,
                };

                const next = updateSite(current, result);

                expect(next).toEqual({
                    id: 'test',
                    time: 7,
                });
            });
        });
    });

    describe('createAtom()', () => {
        it('should return an atom with the site info', () => {
            const site = {
                id: 'test',
                time: 10,
            };
            const a1 = createAtom(site, null, {});

            expect(a1).toEqual(atom(atomId('test', 11), null, {}));
        });
    });
});

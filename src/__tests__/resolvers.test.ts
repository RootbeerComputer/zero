import {queryHeuristics} from '../resolvers';

describe('Query Params Heuristics', () => {
  test('simple limit', () => {
    expect(queryHeuristics([3, 4, 5], {limit: 2})).toEqual([3, 4]);
  });
});
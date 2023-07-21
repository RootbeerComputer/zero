import { graphql } from 'graphql';
import {fakeTypeResolver, fakeFieldResolver, database, queryHeuristics, unassignedFakeObjects} from '../resolvers';
import {
  parse,
  buildASTSchema,
} from 'graphql';

describe('Query Params Heuristics', () => {
  afterEach(() => {
    Object.assign(database,{});
    Object.assign(unassignedFakeObjects,{});
  });

  test('simple e2e query', () => {
    const schemaAST = parse(`
      type Query {
        getAllUsers(limit: Int): [User!]!
      }
      type User {
        id: ID!
        name: String!
      }
    `);
    let schema = buildASTSchema(schemaAST);
    Object.assign(database,{User: {"1": {id: "1", name: "Evan"}, "2": {id: "2", name: "Kenny"}, "3": {id: "3", name: "Bob"}}});
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema,
      source: `
        query {
          getAllUsers(limit: 2) {
            id
            name
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result).toEqual({
        data: {
          getAllUsers: [
            {id: "1", name: "Evan"},
            {id: "2", name: "Kenny"},
          ]
        }
      });
    });
  });

  test('simple limit', () => {
    expect(queryHeuristics([3, 4, 5], {limit: 2})).toEqual([3, 4]);
  });
});
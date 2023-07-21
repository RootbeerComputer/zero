import { graphql } from 'graphql';
import {fakeTypeResolver, fakeFieldResolver, database, queryHeuristics, unassignedFakeObjects} from '../resolvers';
import {
  parse,
  buildASTSchema,
} from 'graphql';
import * as fs from 'fs';
import * as path from 'path';

let graphqlSdl = fs.readFileSync(path.join(__dirname, '../../examples/shopify.graphql'), 'utf-8');
const shopifySchema = buildASTSchema(parse(graphqlSdl));

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
    const schema = buildASTSchema(schemaAST);
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

describe('shopify', () => {
  afterEach(() => {
    Object.assign(database,{});
    Object.assign(unassignedFakeObjects,{});
  });

  test('toplevel connection', () => {
    Object.assign(database,{Article: {"1": {id: "1", title: "Art of War"}, "2": {id: "2", title: "Three Body Problem"}, "3": {id: "3", title: "Wandering Earth"}}});
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema: shopifySchema,
      source: `
        query {
          articles(first: 2, reverse: true) {
            edges {
              node {
                id
                title
              }
            }
            nodes {
              id
              title
            }
            pageInfo {
              endCursor
              startCursor
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result.data.articles.edges.map(e => e.node)).toEqual(result.data.articles.nodes);
      expect(result).toEqual({
        data: {
          articles: {
            edges: [
              {node: {id: "3", title: "Wandering Earth"}},
              {node: {id: "2", title: "Three Body Problem"}},
            ],
            nodes: [
              {id: "3", title: "Wandering Earth"},
              {id: "2", title: "Three Body Problem"},
            ],
            pageInfo: {
              endCursor: "2",
              startCursor: "3"
            }
          }
        }
      });
    });
  });

  test('nested connection', () => {
    Object.assign(database,{
      Product: {"1": {id: "1", title: "", images: 7}, "2": {id: "2", title: "Flamethrower", images: 8}, "3": {id: "3", title: "", images: 9}},
      Image: {"4": {id: "4", width: 100}, "5": {id: "5", width: 200}, "6": {id: "6", width: 300}},
      ImageConnection: {
        "7": {edges: [9, 10], nodes: [4, 5], pageInfo: {endCursor: "5", startCursor: "4"}},
        "8": {edges: [11], nodes: [6], pageInfo: {endCursor: "6", startCursor: "6"}}
      },
      ImageEdge: {
        "9": {cursor: "4", node: 4},
        "10": {cursor: "5", node: 5},
        "11": {cursor: "6", node: 6}
      }
    });
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema: shopifySchema,
      source: `
        query {
          product(id: "2") {
            title
            images {
              edges {
                node {
                  id
                  width
                }
              }
              nodes {
                id
                width
              }
              pageInfo {
                endCursor
                startCursor
              }
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result.data.product.images.edges.map(e => e.node)).toEqual(result.data.product.images.nodes);
      expect(result).toEqual({
        data: {
          product: {
            title: "Flamethrower",
            images: {
              edges: [
                {node: {id: "6", width: 300}},
              ],
              nodes: [
                {id: "6", width: 300},
              ],
              pageInfo: {
                endCursor: "6",
                startCursor: "6"
              }
            }
          }
        }
      });
    });
  });
});
import { GraphQLError, graphql } from 'graphql';
import {fakeTypeResolver, fakeFieldResolver, database, queryHeuristics, unassignedFakeObjects} from '../resolvers';
import {
  parse,
  buildASTSchema,
} from 'graphql';
import * as fs from 'fs';
import * as path from 'path';

const fileToSchema = (filename: string) => buildASTSchema(parse(fs.readFileSync(path.join(__dirname, filename), 'utf-8')))
const shopifySchema = fileToSchema('../../examples/shopify.graphql')
const linearSchema = fileToSchema('../../examples/linear.graphql')

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
    expect(queryHeuristics([3, 4, 5], {limit: 2}, ["0", "1", "2"])).toEqual({objs: [3, 4], pageInfo: {endCursor: "1", startCursor: "0", hasPreviousPage: false, hasNextPage: true}});
    expect(queryHeuristics([3, 4, 5], {limit: 3}, ["0", "1", "2"])).toEqual({objs: [3, 4, 5], pageInfo: {endCursor: "2", startCursor: "0", hasPreviousPage: false, hasNextPage: false}});
  });
});

describe('shopify', () => {
  afterEach(() => {
    Object.assign(database,{});
    Object.assign(unassignedFakeObjects,{});
  });

  test('toplevel connection', async () => {
    Object.assign(database,{Article: {"1": {id: "1", title: "Art of War"}, "2": {id: "2", title: "Three Body Problem"}, "3": {id: "3", title: "Wandering Earth"}}});
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    const result = await graphql({
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
    })
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
    // new args this time
    const result2 = await graphql({
      schema: shopifySchema,
      source: `
        query {
          articles(after: "1", reverse: false) {
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
              hasNextPage
              hasPreviousPage
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    })
    expect(result2.data.articles.edges.map(e => e.node)).toEqual(result2.data.articles.nodes);
    expect(result2).toEqual({
      data: {
        articles: {
          edges: [
            {node: {id: "2", title: "Three Body Problem"}},
            {node: {id: "3", title: "Wandering Earth"}},
          ],
          nodes: [
            {id: "2", title: "Three Body Problem"},
            {id: "3", title: "Wandering Earth"},
          ],
          pageInfo: {
            startCursor: "2",
            endCursor: "3",
            hasNextPage: false,
            hasPreviousPage: true
          }
        }
      }
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

  test('nonconnection basic args', () => {
    Object.assign(database,{
      Product: {
        "1": {id: "1", options: [4, 5, 6], title: ""},
        "2": {id: "2", options: [4, 5, 6], title: "T Shirt"},
        "3": {id: "3", options: [], title: "Metal Waist Belt"}
      },
      ProductOption: {
        "4": {id: "4", name: "Size", values: ["Small", "Medium", "Large"]},
        "5": {id: "5", name: "Color", values: ["Red", "Green", "Blue"]},
        "6": {id: "6", name: "Material", values: ["Cotton", "Synthetic", "Wool"]}
      },
    });
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema: shopifySchema,
      source: `
        query {
          p2: product(id: "2") {
            title
            options(first: 2) {
              id
              name
              values
            }
          }
          p3: product(id: "3") {
            title
            options(first: 2) {
              id
              name
              values
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result).toEqual({
        data: {
          p2: {
            title: "T Shirt",
            options: [
              {id: "4", name: "Size", values: ["Small", "Medium", "Large"]},
              {id: "5", name: "Color", values: ["Red", "Green", "Blue"]},
            ]
          },
          p3: {
            title: "Metal Waist Belt",
            options: []
          }
        }
      });
    });
  });
  
  test('get item on nonid field', () => {
    Object.assign(database,{
      Collection: {
        "7": {id: "7", products: [1, 2, 3], title: "Belts", handle: "belts"},
        "8": {id: "8", products: [4, 5, 6], title: "Shoes and Socks", handle: "shoes-and-socks"},
      }
    });
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema: shopifySchema,
      source: `
        query {
          collection(handle: "shoes-and-socks") {
            title
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result).toEqual({
        data: {
          collection: {
            title: "Shoes and Socks",
          }
        }
      });
    });
  });

  // test('StringConnection is a connection of scalars', () => {
  //   Object.assign(database,{
  //     StringConnection: {
  //       "7": {edges: [9, 10, 11, 12, 13], nodes: ["winter", "summer", "spring", "dance", "sports"], pageInfo: {endCursor: "5", startCursor: "4"}},
  //       "8": {edges: [14, 15, 16], nodes: ["shoes", "hats", "shirts"], pageInfo: {endCursor: "6", startCursor: "6"}}
  //     },
  //     StringEdge: {
  //       "9": {cursor: "0", node: "winter"},
  //       "10": {cursor: "1", node: "summer"},
  //       "11": {cursor: "2", node: "spring"},
  //       "12": {cursor: "3", node: "dance"},
  //       "13": {cursor: "4", node: "sports"},
  //       "14": {cursor: "5", node: "shoes"},
  //       "15": {cursor: "6", node: "hats"},
  //       "16": {cursor: "7", node: "shirts"},
  //     }
  //   });
  //   Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
  //   return graphql({
  //     schema: shopifySchema,
  //     source: `
  //       query {
  //         productTags(first: 3) {
  //           edges {
  //             node
  //           }
  //         }
  //         productTypes(first: 2) {
  //           edges {
  //             node
  //           }
  //         }
  //       }`,
  //     typeResolver: fakeTypeResolver,
  //     fieldResolver: fakeFieldResolver
  //   }).then((result) => {
  //     expect(result).toEqual({
  //       data: {
  //         collection: {
  //           title: "Shoes and Socks",
  //         }
  //       }
  //     });
  //   });
  // });

  test('get all api versions', () => {
    Object.assign(database,{
      ApiVersion: {
        "6": {id: "6", displayName: "v3.1 Alpha", handle: "v3-01-alpha", supported: false},
        "7": {id: "7", displayName: "v3.2 Alpha", handle: "v3-02-alpha", supported: false},
        "8": {id: "8", displayName: "v3 RC", handle: "v3-rc", supported: true},
        "9": {id: "9", displayName: "v3", handle: "v3-prod", supported: true},
        "10": {id: "10", displayName: "v4 Alpha", handle: "v4-alpha", supported: false},
        "11": {id: "11", displayName: "v4 RC", handle: "v4-rc", supported: true},
        "12": {id: "12", displayName: "v4", handle: "v4-prod", supported: true},
      }
    });
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema: shopifySchema,
      source: `
        query {
          publicApiVersions {
            displayName
            handle
            supported
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result).toEqual({
        data: {
          publicApiVersions: [
            {
              displayName: "v3.1 Alpha",
              handle: "v3-01-alpha",
              supported: false
            },
            {
              displayName: "v3.2 Alpha",
              handle: "v3-02-alpha",
              supported: false
            },
            {
              displayName: "v3 RC",
              handle: "v3-rc",
              supported: true
            },
            {
              displayName: "v3",
              handle: "v3-prod",
              supported: true
            },
            {
              displayName: "v4 Alpha",
              handle: "v4-alpha",
              supported: false
            },
            {
              displayName: "v4 RC",
              handle: "v4-rc",
              supported: true
            },
            {
              displayName: "v4",
              handle: "v4-prod",
              supported: true
            }
          ]
        }
      });
    });
  });

  test('err on missing fields in database blob', async () => {
    Object.assign(database,{
      ApiVersion: {
        "7": {id: "7", products: [1, 2, 3], title: "Belts", handle: "belts"},
        "8": {id: "8", products: [4, 5, 6], title: "Shoes and Socks", handle: "shoes-and-socks"},
      }
    });
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    const result1 = await graphql({
      schema: shopifySchema,
      source: `
        query {
          publicApiVersions {
            displayName
            handle
            supported
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    })
    expect(result1).toEqual({
      data: null,
      errors: [
        new GraphQLError("the field, displayName, should be in parent field since it's a leaf and non root and nonnull")
      ]
    });
    const result2 = await graphql({
      schema: shopifySchema,
      source: `
        query {
          publicApiVersions {
            handle
            supported
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    })
    expect(result2).toEqual({
      data: null,
      errors: [
        new GraphQLError("the field, supported, should be in parent field since it's a leaf and non root and nonnull")
      ]
    });
  });
});

describe('linear', () => {
  afterEach(() => {
    Object.assign(database,{});
    Object.assign(unassignedFakeObjects,{});
  });

  test('toplevel pagination', async () => {
    Object.assign(database,{ProjectMilestone: {"1": {id: "1", name: "Art of War", updatedAt: "2016-03-01T13:10:20Z"}, "2": {id: "2", name: "Three Body Problem", updatedAt: "2016-02-01T13:10:20Z"}, "3": {id: "3", name: "Wandering Earth", updatedAt: "2016-01-01T13:10:20Z"}}});
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    const result = await graphql({
      schema: linearSchema,
      source: `
        query {
          ProjectMilestones(first: 2, orderBy: updatedAt) {
            edges {
              node {
                id
                name
              }
            }
            nodes {
              id
              name
            }
            pageInfo {
              endCursor
              startCursor
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    })
    expect(result.data.ProjectMilestones.edges.map(e => e.node)).toEqual(result.data.ProjectMilestones.nodes);
    expect(result).toEqual({
      data: {
        ProjectMilestones: {
          edges: [
            {node: {id: "3", name: "Wandering Earth"}},
            {node: {id: "2", name: "Three Body Problem"}},
          ],
          nodes: [
            {id: "3", name: "Wandering Earth"},
            {id: "2", name: "Three Body Problem"},
          ],
          pageInfo: {
            endCursor: "2",
            startCursor: "3"
          }
        }
      }
    });
    // new args this time
    const result2 = await graphql({
      schema: shopifySchema,
      source: `
        query {
          articles(after: "1", reverse: false) {
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
              hasNextPage
              hasPreviousPage
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    })
    expect(result2.data.articles.edges.map(e => e.node)).toEqual(result2.data.articles.nodes);
    expect(result2).toEqual({
      data: {
        articles: {
          edges: [
            {node: {id: "2", title: "Three Body Problem"}},
            {node: {id: "3", title: "Wandering Earth"}},
          ],
          nodes: [
            {id: "2", title: "Three Body Problem"},
            {id: "3", title: "Wandering Earth"},
          ],
          pageInfo: {
            startCursor: "2",
            endCursor: "3",
            hasNextPage: false,
            hasPreviousPage: true
          }
        }
      }
    });
  });


  test('get item on id field String instead of ID', () => {
    Object.assign(database,{
      CustomView: {
        "1a": {id: "1a", organization: 4, name: "Belts"},
        "2a": {id: "2a", organization: 5, name: "Shoes and Socks"},
        "3a": {id: "3a", organization: 5, name: "rovers"},
      },
      Organization: {
        "4": {id: "4"},
        "5": {id: "5"},
      }
    });
    Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
    return graphql({
      schema: linearSchema,
      source: `
        query {
          customView(id: "2a") {
            name
            organization {
              id
            }
          }
        }`,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver
    }).then((result) => {
      expect(result).toEqual({
        data: {
          customView: {
            name: "Shoes and Socks",
            organization: {
              id: "5"
            }
          }
        }
      });
    });
  });
});
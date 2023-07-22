// import * as assert from 'assert';
import {
  isListType,
  isNonNullType,
  isCompositeType,
  isLeafType,
  getNullableType,
  GraphQLTypeResolver,
  GraphQLFieldResolver,
  defaultTypeResolver,
  defaultFieldResolver,
  isAbstractType,
  assertAbstractType,
  isObjectType,
  isScalarType,
  isEnumType,
  assertScalarType,
  assertEnumType,
  assertObjectType,
  assertCompositeType,
  assertListType,
  GraphQLCompositeType,
  GraphQLSchema,
  GraphQLObjectType,
  assertNonNullType,
} from 'graphql';

type DatabaseType = {
  [key: string]: {
    [key: number]: any;
  };
}
export const database: DatabaseType = {}; // Map<typeName, Map<id, object>>
export const partialsDatabase: DatabaseType = {} // Map<typeName, Map<id, object>>
export const unassignedPartials = {} // Map<typeName, id[]>
export const unassignedFakeObjects = {} // Map<typeName, id[]>
const assignedPartialFakeObject: {[key: string]: {[key: string]: object}} = {}; // Map<assignedObjectId, object_extended_field_map>
const assignedReferencedFakeObject: {[key: string]: {[key: string]: object}} = {}; // Map<objectId, Map<fieldname, fake_object_ref>>

export const fakeTypeResolver: GraphQLTypeResolver<unknown, unknown> = async (
  value: object,
  context,
  info,
  abstractType,
) => {
  const defaultResolved = await defaultTypeResolver(
    value,
    context,
    info,
    abstractType,
  );
  if (defaultResolved != null) {
    return defaultResolved;
  }

  if ('id' in value) {
    //@ts-ignore
    if (typeof value.id === 'number') {
      const possibleTypes = info.schema.getPossibleTypes(abstractType).map((type) => type.name);
      //@ts-ignore
      const resolvedType = Object.entries(database).find(([key, valueMap]) => possibleTypes.includes(key) && (value.id as number) in valueMap)?.[0];
      //@ts-ignore
      // console.log("resolved type", resolvedType, value)
      return resolvedType;
    }
    else {
      //@ts-ignore
      throw new Error(`id should be a number but instead it is ${value.id}`)
    }
  } else {
    throw new Error(`value should have an id but instead it is ${value}`)
  }
};

export const queryHeuristics = (data: any[], args: any) => {
  let ret = data;
  const order = args.order || args.orderBy || args.sortKey;
  const sort = args.sort || args.orderDirection || (args.reverse ? "desc" : undefined);
  const offset = args.offset || args.skip;
  const limit = args.limit || args.first;
  if (order && sort) {
    if (ret.length > 0) {
      const actualKey = order in ret[0] ? order : (order.toLowerCase() in ret[0] ? order.toLowerCase() : undefined);
      if (actualKey) {
        ret.sort((a, b) => {
          if (sort === "asc" || sort == "ASC") {
            return a[actualKey] < b[actualKey] ? -1 : 1;
          } else if (sort === "desc" || sort === "DESC") {
            return b[actualKey] < a[actualKey] ? -1 : 1;
          } else {
            throw new Error("Invalid sort value. Must be 'asc' or 'desc'.");
          }
        });
      } else {
        console.log(`${order} field not in object`)
      }
    }
  }
  if (offset && limit) {
    ret = ret.slice(offset, offset + limit);
  } else if (limit) {
    ret = ret.slice(0, limit);
  } else if (offset) {
    ret = ret.slice(offset);
  }
  return ret
}

export const fakeFieldResolver: GraphQLFieldResolver<unknown, unknown> = async (
  source,
  args,
  context,
  info,
) => {
  const { schema, parentType, fieldName } = info;
  const fieldDef = parentType.getFields()[fieldName];

  let resolved = await defaultFieldResolver(source, args, context, info);
  if (resolved === undefined && source && typeof source === 'object') {
    resolved = source[info.path.key]; // alias value // TODO when use info.path.key vs fieldName? What's the difference?
  }

  if (resolved instanceof Error) {
    return resolved;
  }

  let fieldDefUnwrappedType = fieldDef.type
  if (isNonNullType(fieldDefUnwrappedType)) fieldDefUnwrappedType = fieldDefUnwrappedType.ofType
  if (isListType(fieldDefUnwrappedType)) fieldDefUnwrappedType = fieldDefUnwrappedType.ofType
  if (isNonNullType(fieldDefUnwrappedType)) fieldDefUnwrappedType = fieldDefUnwrappedType.ofType

  if (parentType === schema.getQueryType()) {
    if (resolved !== undefined) {
      return resolved; // its probably a object from the proxy server
    }
    let t = fieldDef.type
    let shouldReturnNonnull = false;
    if (isNonNullType(t)) t = t.ofType; shouldReturnNonnull = true;
    // TODO: throw error when user forgot to include a arg that the schema says they should incldue!
    if (!isListType(t) && !args.id) {
      if (t.name.endsWith("Connection")) {
        const underlyingTypeName = t.name.replace(/Connection$/, "");
        const objs = queryHeuristics(
          Object.values(database[underlyingTypeName]).sort((a, b) => a.id - b.id),
          args
        );
        return {
          // todo support ai generated primitives on this top level query Connection object and its edges/pageInfo
          edges: objs.map((obj) => ({cursor: obj.id, node: obj})),
          nodes: objs,
          // filters: 
          pageInfo: {
            startCursor: objs[0].id,
            endCursor: objs[objs.length - 1].id,
            hasNextPage: false,
            hasPreviousPage: false,
          }
        }
      } else {
        // TODO: these are heuristics, we should ask AI to infer biz logic
        if (Object.keys(args).length === 0)
          return Object.values(database[t.name])[0]
        else if (Object.keys(args).length === 1) {
          const lookupField = Object.keys(args)[0]
          const o = Object.values(database[t.name]).find((obj) => obj[lookupField] === args[lookupField])
          if (o === null && shouldReturnNonnull)
            throw new Error(`Object of type ${t.name} with field ${lookupField} equal to ${args[lookupField]} not in database`)
          return o
        } else {
          throw new Error("Query that returns a single object must have a id param. Its on our roadmap to infer biz logic so you don't get this error.")
        }
      }
    }
    if (isListType(t) && args.id) throw new Error("Query that returns a list should not have id param. This shouldn't be encountered. Open an issue on github.")
    if (isListType(t)) t = t.ofType
    if (isNonNullType(t)) t = t.ofType
    if (isAbstractType(t)) {
      t = assertAbstractType(t);
      const possibleTypes = schema.getPossibleTypes(t);
      if (args.id) {
        return getObjectFromDatabaseWithId(args.id, t, schema, source);
      } else {
        let out = []
        for (const type of possibleTypes) {
          if (type.name in database) {
            out.push(...Object.values(database[type.name])) // Currently, we return all objects matching a type when you query. In the future, we'll support pagination and filtering.
          } else {
            throw new Error(`Type ${t.name} not in database`)
          }
        }
        return queryHeuristics(out, args)
      }
    } else {
      if (!isObjectType(t)) {
        if (!isScalarType(t) || !isEnumType(t)) {
          throw new Error(`This shouldn't happen. Open an issue.`)
        } else {
          if (isScalarType(t)) {
            t = assertScalarType(t)
            return t.parseValue(0) // need biz logic inferred by AI. Happy to merge some heuristic PRs for now. We also could have the server list some example values here
          } else {
            t = assertEnumType(t)
            return t.parseValue(0) // need biz logic inferred by AI. Happy to merge some heuristic PRs for now. We also could have the server list some example values here
          }
        }
      }
      t = assertObjectType(t)
      
      if (!(t.name in database)) {
        throw new Error(`Type ${t.name} not in database`)
      }
      if (args.id) {
        if (!(args.id in database[t.name]) && shouldReturnNonnull) {
          throw new Error(`Object with id ${args.id} not in database`)
        }
        return database[t.name][args.id]
      } else {
        const out = Object.values(database[t.name])
        return queryHeuristics(out, args)
      }
    }
  } else if (isLeafType(fieldDefUnwrappedType)) {
    // TODO need the above condition to trigger on list of leafs
    if ((fieldDef.extensions && fieldDef.extensions['isExtensionField'])) {
      if (resolved !== undefined) {
        return resolved;
      }
      if (!(source["id"] in assignedPartialFakeObject)) { // TODO is there a better way than source['ID']?
        //@ts-ignore
        assignedPartialFakeObject[source["id"]] = partialsDatabase[parentType.name][unassignedPartials[parentType.name].pop()]
        if (unassignedPartials[parentType.name].length === 0) {
          unassignedPartials[parentType.name] = Object.keys(partialsDatabase[parentType.name])
        }
      }
      return assignedPartialFakeObject[source["id"]][info.path.key]
    }
    if (resolved === undefined && isNonNullType(fieldDef.type)) {
      throw new Error("Type should be in parent field since it's a leaf and non root")
    }
    // TODO handle undefined list elements when should be [Int!]! or [Int!]
    if (isListType(isNonNullType(fieldDef.type) ? fieldDef.type.ofType : fieldDef.type)) {
      if (isNonNullType(fieldDef.type)) {
        if (resolved !== undefined && resolved !== null) {
          return resolved;
        } else {
          throw Error(`Field ${fieldDef.name} is non null but resolved is ${resolved}`)
        }
      } else {
        return resolved;
      }
    } else {
      if (isNonNullType(fieldDef.type)) {
        if (resolved !== undefined && resolved !== null) {
          return resolved;
        } else {
          throw Error(`Field ${fieldDef.name} is non null but resolved is ${resolved}`)
        }
      } else {
        return resolved;
      }
    }
  } else { // cur field is a reference to another object
    if (parentType === schema.getQueryType()) throw new Error("shouldn't be here")
    if ((fieldDef.extensions && fieldDef.extensions['isExtensionField']) && resolved === undefined) {
      // TODO if source[info.path.key] is assigned we should cehck that its the same as the value in unassignedFakeObject?
      // or nah since even though this is a non extension object, it could still be a mock
      //        if list type then need to pick out multiple
      if (!(source["id"] in assignedReferencedFakeObject)) assignedReferencedFakeObject[source["id"]] = {}
      if (!(info.path.key in assignedReferencedFakeObject[source["id"]])) {
        let remoteType = fieldDef.type
        if (isNonNullType(remoteType)) remoteType = remoteType.ofType
        if (isListType(remoteType)) remoteType = remoteType.ofType
        if (isNonNullType(remoteType)) remoteType = remoteType.ofType
        remoteType = assertCompositeType(remoteType)
        if (isListType(isNonNullType(fieldDef.type) ? fieldDef.type.ofType : fieldDef.type)) {
          // pop at most 4 elements.
          assignedReferencedFakeObject[source["id"]][info.path.key] = unassignedFakeObjects[remoteType.name].splice(-4, 4)
        } else {
          assignedReferencedFakeObject[source["id"]][info.path.key] = unassignedFakeObjects[remoteType.name].pop()
        }
        if (unassignedFakeObjects[remoteType.name].length === 0) {
          unassignedFakeObjects[remoteType.name] = Object.keys(database[remoteType.name]);
        }
      }
      //@ts-ignore
      source = {...source, [info.path.key]: assignedReferencedFakeObject[source["id"]][info.path.key]}
    }
    var type = fieldDef.type
    if (isNonNullType(type)) {
      type = type.ofType;
      if (source[info.path.key] === null) {
        throw new Error("Error, source field is null but output type is non null")
      }
    } else if (source[info.path.key] === null) {
      return null;
    }
    if (isListType(type)) {
      var listElementType = assertListType(type).ofType
      var allowNull = true;
      if (isNonNullType(listElementType)) {
        listElementType = listElementType.ofType
        allowNull = false;
      }
      listElementType = assertCompositeType(listElementType)
      if (source[info.path.key].length === 0) {
        return []
      }
      if (parentType.name.endsWith("Connection") && (info.path.key === "nodes" || info.path.key === "edges") && typeof source[info.path.key][0] === "object") { // TODO if source[info.path.key].length === 0 does this crash?
        return source[info.path.key]
      }
      const objs = source[info.path.key].map((id) => {
        if (allowNull && id === null) {
          return null
        }
        return getObjectFromDatabaseWithId(id, listElementType, schema, source)
      })
      return queryHeuristics(objs, args);
    } else {
      if (type.name.endsWith("Connection")) { // note: an alternative impl could be to pass down Connection args via context
        type = assertObjectType(type)
        type.getFields()
        const underlyingTypeName = type.name.replace(/Connection$/, "");
        const underlyingType = schema.getType(underlyingTypeName) // todo assert this matches up with return type of the nodes field
        if (!underlyingType) throw new Error(`Type ${underlyingTypeName} not in schema`)
        if (!isCompositeType(underlyingType)) throw new Error(`Type ${underlyingTypeName} is not a composite type for connection ${type.name}`)
        const connectionObj = getObjectFromDatabaseWithId(source[info.path.key],type,schema, source);
        let objs = connectionObj['nodes'].map((id) => {
          if (allowNull && id === null) {
            return null
          }
          return getObjectFromDatabaseWithId(id, underlyingType, schema, source)
        })
        objs = queryHeuristics(objs, args)
        const connectionObjsEdges = connectionObj['edges'].map((id) => {
          if (allowNull && id === null) {
            return null
          }
          let edgeType = (type as GraphQLObjectType).getFields()['edges'].type
          if (isNonNullType(edgeType)) edgeType = assertNonNullType(edgeType).ofType
          if (isListType(edgeType)) edgeType = assertListType(edgeType).ofType
          if (isNonNullType(edgeType)) edgeType = assertNonNullType(edgeType).ofType
          edgeType = assertObjectType(edgeType)
          return getObjectFromDatabaseWithId(id, edgeType, schema, source)
        })
        return {
          ...connectionObj, // include this b/c there might be some ai generated primitives to fill in
          edges: objs.map(
            (obj) => ({...(connectionObjsEdges.find(e=>e.cursor == obj.id)), cursor: obj.id, node: obj})), // todo this "find" will be slow... optimize
          nodes: objs,
          // filters: 
          pageInfo: {
            startCursor: objs[0].id,
            endCursor: objs[objs.length - 1].id,
            hasNextPage: false,
            hasPreviousPage: false,
          }
        }
      }
      if (parentType.name.endsWith("Connection") && info.path.key === "pageInfo" && typeof source[info.path.key] === "object") {
        return source[info.path.key]
      }
      if (parentType.name.endsWith("Edge") && (info.path.key === "node") && typeof source[info.path.key] === "object") { // TODO kind of wrong since we need to enforce that parentType's parentType name ends with "Connection"
        // TODO also, according to spec, edge type doesn't have to end in Edge. It could be called something else
        return source[info.path.key]
      }
      type = assertCompositeType(type)
      const id = source[info.path.key]; // .id?
      return getObjectFromDatabaseWithId(id, type, schema, source)
    }
  }
  // TODO support mutations with AI
  const isMutation = parentType === schema.getMutationType();
  const isCompositeReturn = isCompositeType(getNullableType(fieldDef.type));
  if (isMutation && isCompositeReturn && isPlainObject(resolved)) {
    const inputArg = args['input'];
    return {
      ...(Object.keys(args).length === 1 && isPlainObject(inputArg)
        ? inputArg
        : args),
      ...resolved,
    };
  }
  return resolved;
};

function getObjectFromDatabaseWithId(id: any, t: GraphQLCompositeType, schema: GraphQLSchema, source) {
  // if (typeof id !== 'number')
  //   throw new Error(`id should be a number but instead it is ${id} on the object ${JSON.stringify(source)} for fieldDef.type ${fieldDef.type}`);
  if (id === null || id === undefined)
    throw new Error(`id should not be null but instead it is ${id} on the object ${JSON.stringify(source)}`);
  if (typeof id === 'object')
    throw new Error(`id should be a number but instead it is ${id} on the object ${JSON.stringify(source)}`);
  // TODO does this support abstract type?
  let obj = null;
  if (isAbstractType(t)) {
    t = assertAbstractType(t);
    const possibleTypes = schema.getPossibleTypes(t);
    for (const p of possibleTypes) {
      if (!(p.name in database)) {
        throw new Error(`Type ${p.name} not in database`);
      }
      if (id in database[p.name]) {
        obj = database[p.name][id];
        break;
      }
    }
  } else {
    t = assertObjectType(t);
    obj = database[t.name][id];
  }
  if (obj === null || obj === undefined)
    throw new Error(`obj should be well defined but instead it is ${obj} on the object ${JSON.stringify(source)}`);
  return obj;
}

function isPlainObject(maybeObject) {
  return (
    typeof maybeObject === 'object' &&
    maybeObject !== null &&
    !Array.isArray(maybeObject)
  );
}
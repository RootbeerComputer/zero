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
} from 'graphql';

type DatabaseType = {
  [key: string]: {
    [key: number]: object;
  };
}
export const database: DatabaseType = {}; // Map<typeName, Map<id, object>>
export const partialsDatabase: DatabaseType = {} // Map<typeName, Map<id, object>>
export const unsassignedPartials = {} // Map<typeName, id[]>
export const unsassignedFakeObjects = {} // Map<typeName, id[]>
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

  if (resolved !== undefined) {
    // TODO idk, maybe i want to add an && condition that this is a proxied object
    return resolved;
  }

  if (resolved instanceof Error) {
    return resolved;
  }

  if (parentType === schema.getQueryType()) {
    // for now, we assume that a query returns a single object or all objects of its return type.
    // We don't support pagination yet. Nor any kind of filtering / sorting / biz logic. Nor non id params The AI will perform such tasks soon.
    let t = fieldDef.type
    let shouldReturnNonnull = false;
    if (isNonNullType(t)) t = t.ofType; shouldReturnNonnull = true;
    // TODO: throw error when user forgot to include a arg that the schema says they should incldue!
    if (!isListType(t) && !args.id) throw new Error("Query that returns a single object must have a id param. Its on our roadmap to infer biz logic so you don't get this error.")
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
        return out
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
        return Object.values(database[t.name]) // Currently, we return all objects matching a type when you query. In the future, we'll support pagination and filtering.
      }
    }
  } else if (isNonNullType(fieldDef.type) ? isLeafType(fieldDef.type.ofType) : isLeafType(fieldDef.type)) {
    if ((fieldDef.extensions['isExtensionField'])) {
      if (resolved !== undefined) {
        return resolved;
      }
      if (!(source["id"] in assignedPartialFakeObject)) { // TODO is there a better way than source['ID']?
        //@ts-ignore
        assignedPartialFakeObject[source["id"]] = partialsDatabase[parentType.name][unsassignedPartials[parentType.name].pop()]
        if (unsassignedPartials[parentType.name].length === 0) {
          unsassignedPartials[parentType.name] = Object.keys(partialsDatabase[parentType.name])
        }
      }
      return assignedPartialFakeObject[source["id"]][info.path.key]
    }
    if (resolved === undefined && isNonNullType(fieldDef.type)) {
      throw new Error("Type should be in parent field since its a leaf and non root")
    }
    // TODO handle undefined list elements when should be [Int!]! or [Int!]
    if (isListType(isNonNullType(fieldDef.type) ? fieldDef.type.ofType : fieldDef.type)) {
      // TODO if resolved is undefined
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
    if ((fieldDef.extensions['isExtensionField']) && resolved === undefined) {
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
          assignedReferencedFakeObject[source["id"]][info.path.key] = unsassignedFakeObjects[remoteType.name].splice(-4, 4)
        } else {
          assignedReferencedFakeObject[source["id"]][info.path.key] = unsassignedFakeObjects[remoteType.name].pop()
        }
        if (unsassignedFakeObjects[remoteType.name].length === 0) {
          unsassignedFakeObjects[remoteType.name] = Object.keys(database[remoteType.name]);
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
      return source[info.path.key].map((id) => {
        if (allowNull && id === null) {
          return null
        }
        return getObjectFromDatabaseWithId(id, listElementType, schema, source)
      })
    } else {
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
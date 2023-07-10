import {
  Source,
  GraphQLError,
  GraphQLSchema,
  parse,
  // validate,
  extendSchema,
  buildASTSchema,
  validateSchema,
  isObjectType,
  isInterfaceType,
} from 'graphql';

// FIXME
import { validateSDL } from 'graphql/validation/validate';
export function buildWithFakeDefinitions(
  schemaSDL: Source,
  extensionSDL?: Source,
  options?: { skipValidation: boolean },
): {schema: GraphQLSchema, newTypes: {}, extendedFields: {}} {
  const skipValidation = options?.skipValidation ?? false;
  const schemaAST = parse(schemaSDL);
  let schema = buildASTSchema(schemaAST, {assumeValidSDL: true}); // assumeValidSDL lets us ignore custom directives

  const newTypes = {}
  const extendedFields = {}
  if (extensionSDL != null) {
    const extensionAST = parse(extensionSDL);
    if (!skipValidation) { 
      const errors = validateSDL(extensionAST, schema);
      if (errors.length !== 0) {
        throw new ValidationErrors(errors);
      }
    }
    schema = extendSchema(schema, extensionAST, {
      assumeValid: true,
    });

    for (const type of Object.values(schema.getTypeMap())) {
      if (isObjectType(type) || isInterfaceType(type)) {
        const isNewType = type.astNode?.loc?.source === extensionSDL;
        // mark the types that are from the extensionSDL so we can filter them out later as needed
        if (isNewType) {
          newTypes[type.name] = true;
        }
        if (type.extensions) {
          (type.extensions as any)['isNewType'] = isNewType;
        } else {
          type.extensions = { isNewType };
        }
        for (const field of Object.values(type.getFields())) {
          const isExtensionField = field.astNode?.loc?.source === extensionSDL;
          if (isNewType && !isExtensionField) {
            throw new Error(
              `Type "${type.name}" was defined in the extension SDL but field "${field.name}" was not. ` +
              `All fields of a new type must be defined in the extension SDL.`,
            );
          }
          // mark the fields that are from the extensionSDL so we can filter them out later as needed
          if (isExtensionField) {
            if (!extendedFields[type.name]) {
              extendedFields[type.name] = {};
            }
            extendedFields[type.name][field.name] = true;
          }
          if (field.extensions) {
            (field.extensions as any)['isExtensionField'] = isExtensionField;
          } else {
            field.extensions = { isExtensionField };
          }
        }
      }
    }
  }

  if (!skipValidation) {
    const errors = validateSchema(schema);
    if (errors.length !== 0) {
      throw new ValidationErrors(errors);
    }
  }

  return {schema, newTypes, extendedFields};
}

// FIXME: move to 'graphql-js'
export class ValidationErrors extends Error {
  subErrors: GraphQLError[];

  constructor(errors) {
    const message = errors.map((error) => error.message).join('\n\n');
    super(message);

    this.subErrors = errors;
    this.name = this.constructor.name;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

import * as chalk from 'chalk';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { Headers } from 'node-fetch';
import {
  Source,
  GraphQLSchema,
  buildClientSchema,
  getIntrospectionQuery,
  graphql
} from 'graphql';

export function existsSync(filePath: string): boolean {
  try {
    fs.statSync(filePath);
  } catch (err) {
    if (err.code == 'ENOENT') return false;
  }
  return true;
}

export function readSDL(filepath: string): Source {
  return new Source(fs.readFileSync(filepath, 'utf-8'), filepath);
}

export function getRemoteSchema(
  url: string,
  headers: { [name: string]: string },
): Promise<GraphQLSchema> {
  return graphqlRequest(url, headers, getIntrospectionQuery())
    .then((response) => {
      if (response.errors) {
        throw Error(JSON.stringify(response.errors, null, 2));
      }
      return buildClientSchema(response.data);
    })
    .catch((error) => {
      throw Error(`Can't get introspection from ${url}:\n${error.message}`);
    });
}

export function graphqlRequest(
  url,
  headers,
  query,
  variables?,
  operationName?,
) {
  return fetch(url, {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      ...(headers || {}),
    }),
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
  }).then((responce) => {
    if (responce.ok) return responce.json();
    return responce.text().then((body) => {
      throw Error(`${responce.status} ${responce.statusText}\n${body}`);
    });
  });
}


const ROOTBEER_API_BASE_URL = 'https://rootbeercomputer--api-main.modal.run'

export const createMockData = async (schema: GraphQLSchema, newTypes, extendedFields) => {
  let introspection = null;
  try {
    introspection = await graphql({
      schema,
      source: getIntrospectionQuery()
    })
  } catch (error) {
    console.log(chalk.red(error));
    process.exit(1);
  };
  try {
    const response = await fetch(ROOTBEER_API_BASE_URL, {
      method: 'post',
      body: JSON.stringify({introspection, newTypes,
        extendedFields}, null, 2),
      headers: {'Content-Type': 'application/json'}
    });
    if (!response.ok) {
      console.log(chalk.red("The server had an error processing your graphql schema. Please report this bug on github."));
      process.exit(1);  
    }
    return await response.json()
  } catch (error) {
    console.log(chalk.red(error));
    process.exit(1);
  }
}

#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

import * as express from 'express';
import * as chalk from 'chalk';
import * as open from 'open';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
import { graphqlHTTP } from 'express-graphql';
import { Source, printSchema, GraphQLSchema } from 'graphql'; // astFromValue

import { parseCLI } from './cli';
import { getProxyExecuteFn } from './proxy';
import { existsSync, readSDL, getRemoteSchema, createMockData } from './utils';
import { fakeTypeResolver, fakeFieldResolver, database, partialsDatabase, unassignedPartials, unassignedFakeObjects } from './resolvers';
import { ValidationErrors, buildWithFakeDefinitions } from './fake_definition';

const log = console.log;

parseCLI((options) => {
  const { extendURL, headers, forwardHeaders } = options;
  const fileName =
    options.fileName ||
    (extendURL ? './schema_extension.faker.graphql' : './schema.faker.graphql');

  if (!options.fileName) {
    log(
      chalk.yellow(
        `Default file ${chalk.magenta(fileName)} is used. ` +
          `Specify [file] parameter to change.`,
      ),
    );
  }

  let userSDL = existsSync(fileName) && readSDL(fileName);

  if (extendURL) {
    // run in proxy mode
    getRemoteSchema(extendURL, headers)
      .then((schema) => {
        const remoteSDL = new Source(
          printSchema(schema),
          `Inrospection from "${extendURL}"`,
        );

        if (!userSDL) {
          let body = fs.readFileSync(
            path.join(__dirname, 'default-extend.graphql'),
            'utf-8',
          );

          const rootTypeName = schema.getQueryType().name;
          body = body.replace('___RootTypeName___', rootTypeName);

          userSDL = new Source(body, fileName);
        }

        const executeFn = getProxyExecuteFn(extendURL, headers, forwardHeaders);
        runServer(options, userSDL, remoteSDL, executeFn);
      })
      .catch((error) => {
        log(chalk.red(error.stack));
        process.exit(1);
      });
  } else {
    if (!userSDL) {
      userSDL = new Source(
        fs.readFileSync(
          path.join(__dirname, 'default-schema.graphql'),
          'utf-8',
        ),
        fileName,
      );
    }
    runServer(options, userSDL);
  }
});

async function runServer(
  options,
  userSDL: Source,
  remoteSDL?: Source,
  customExecuteFn?,
) {
  const { port, openEditor } = options;
  const corsOptions = {
    credentials: true,
    origin: options.corsOrigin,
  };
  const app = express();
  
  let schema: GraphQLSchema;
  let newTypes: {};
  let extendedFields: {};
  try {
    const s = remoteSDL
    ? buildWithFakeDefinitions(remoteSDL, userSDL)
    : buildWithFakeDefinitions(userSDL);
    schema = s.schema;
    newTypes = s.newTypes;
    extendedFields = s.extendedFields;
  } catch (error) {
    if (error instanceof ValidationErrors) {
      prettyPrintValidationErrors(error);
      process.exit(1);
    } else {
      throw error;
    }
  }

  console.log("Starting to load from server")
  const {newDatabase, newPartialsDatabase} = await createMockData(schema, newTypes, extendedFields);
  console.log(newDatabase)
  console.log(newPartialsDatabase)
  Object.assign(database,newDatabase); // graphql type is the key and then value is another dict from id to object
  Object.assign(partialsDatabase,newPartialsDatabase);
  Object.assign(unassignedPartials, Object.fromEntries(Object.entries(partialsDatabase).map(([typename, object_map]) => [typename, Object.keys(object_map)])))
  Object.assign(unassignedFakeObjects, Object.fromEntries(Object.entries(database).map(([typename, object_map]) => [typename, Object.keys(object_map)])))

  app.options('/graphql', cors(corsOptions));
  app.use(
    '/graphql',
    cors(corsOptions),
    graphqlHTTP(() => ({
      schema,
      typeResolver: fakeTypeResolver,
      fieldResolver: fakeFieldResolver,
      customExecuteFn,
      graphiql: { headerEditorEnabled: true },
    })),
  );

  app.get('/user-sdl', (_, res) => {
    res.status(200).json({
      userSDL: userSDL.body,
      remoteSDL: remoteSDL && remoteSDL.body,
    });
  });

  app.use('/user-sdl', bodyParser.text({ limit: '8mb' }));
  app.post('/user-sdl', (req, res) => {
    try {
      const fileName = userSDL.name;
      fs.writeFileSync(fileName, req.body);
      userSDL = new Source(req.body, fileName);
      // TODO: tell rootbeer to generate new mock data
      ({schema} = remoteSDL
        ? buildWithFakeDefinitions(remoteSDL, userSDL)
        : buildWithFakeDefinitions(userSDL))

      const date = new Date().toLocaleString();
      log(
        `${chalk.green('✚')} schema saved to ${chalk.magenta(
          fileName,
        )} on ${date}`,
      );

      res.status(200).send('ok');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.use('/editor', express.static(path.join(__dirname, 'editor')));

  const server = app.listen(port);

  const shutdown = () => {
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log(`\n${chalk.green('✔')} Your GraphQL Zero API is ready to use 🚀
  Here are your links:

  ${chalk.blue('❯')} Interactive Editor: http://localhost:${port}/editor
  ${chalk.blue('❯')} GraphQL API:        http://localhost:${port}/graphql

  `);

  if (openEditor) {
    setTimeout(() => open(`http://localhost:${port}/editor`), 500);
  }
}

function prettyPrintValidationErrors(validationErrors: ValidationErrors) {
  const { subErrors } = validationErrors;
  log(
    chalk.red(
      subErrors.length > 1
        ? `\nYour schema constains ${subErrors.length} validation errors: \n`
        : `\nYour schema constains a validation error: \n`,
    ),
  );

  for (const error of subErrors) {
    let [message, ...otherLines] = error.toString().split('\n');
    log([chalk.yellow(message), ...otherLines].join('\n') + '\n\n');
  }
}

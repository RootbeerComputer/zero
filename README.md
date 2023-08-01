<div align="center">
:rotating_light: Experimental :warning: <a href="https://www.loom.com/share/abad2cdf325e4e0b9addea1e14406166?sid=484ab008-e9ae-4681-be93-ec419d9eec90">[Demo Video]</a> 
</div>

# GraphQL Zero

<div align="center">
  
[![Discord](https://img.shields.io/discord/1122949106558570648)](https://discord.gg/3ASBTJWgGS)

</div>

Mock your GraphQL API with generative AI fake data... zero config. Powered by LLMs that look at your schema and populate a "parallel universe" of fake data so you can prototype and test your frontend w/o implementing the backend or manually entering a bunch of data.

Use for your next prototyping session, product demo, or QA bug bash!

Example schemas are provided in the `examples` folder

```
npm install -g @rootbeer/zero
zero schema.graphql # replace with your schema
```

Then swap out the URL in your frontend code with

```
http://localhost:9000
```

Note: We don't support persisted queries yet

To proxy to a real graphql server. Write your SDL file with extended types then use this command.

```
zero extended_schema.graphql --extend https://spacex-production.up.railway.app
```

## Motivation

We live in modern times, why poke around in a 100 tabs trying to populate data for your app?

Zero is unlike anything you've seen before
- It's zero config. No faker! No annotating your SDL! No directives!
- It's static. static consistent data: it feels as if its real. you can play around with your app, not just stuck on one page with a chunk of lorem ipsum
- :soon: It's dynamic. AI generated business logic, so you can query and MUTATE. Inspired by [Backend GPT](https://github.com/RootbeerComputer/backend-GPT)
- It's incremental. Mock your entire API to completely separate from prod, or extend an existing API with proxying `zero schema.graphql --extend https://existing-server.com/graphql`

Credit: This repo is a hard fork of [graphql-faker](https://github.com/graphql-kit/graphql-faker)

## Features

Releasing super early and unpolished. There's a 20% chance this works with your GraphQL schema. If it fails, try an easier schema :flushed: If it still fails, make an issue!

- [x] Optionally proxy an existing GraphQL API to extend it with faked data
- [x] Runs as local graphql server
- [x] queries (using heuristics for arguments)
- [ ] persisted queries
- [ ] field arguments for leaf fields (using heuristics)
- [ ] custom scalars (starting with popular standards)
- [ ] directives (starting with popular standards)
- [ ] mutations (including file uploads and auth)
- [ ] subscriptions
- [x] pagination

## How it works

**We don't see any sensitive data.** This makes it easy to use in high security environments (i.e. SOC2).

This CLI tool sends your GraphQL schema definition language (~~including docstrings~~) to us. Our server parses the schema and runs fancy AI algorithms to create a blob of mock data, which gets sent back to the CLI tool. From then on, all queries are executed locally on your machine. We mock at the GraphQL level so it's data source agnostic and client agnostic (Apollo, iOS, Java, etc).

Some have asked about a Postgres edition. Reach out if this interests you.

## Contribute

All PRs will be reviewed within 24 hours!

I'd especially appreciate bugfixes, examples, tests, federation support, quality of life improvements, and render/heroku/docker build things!

For bigger contributions, we have a [GitHub Project](https://github.com/orgs/RootbeerComputer/projects/2)

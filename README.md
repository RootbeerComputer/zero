<div align="center">
:rotating_light: Experimental and probably won't work :warning: <a href="https://www.loom.com/share/abad2cdf325e4e0b9addea1e14406166?sid=484ab008-e9ae-4681-be93-ec419d9eec90">[Demo Video]</a> 
</div>

# GraphQL Zero

Mock your GraphQL API with generative AI fake data... zero config. Powered by LLMs that look at your schema and populate a "parallel universe" of fake data so you can prototype and test your frontend w/o implementing the backend or manually entering a bunch of data.

Use for your next prototyping session, product demo, or QA bug bash!

```
npm install -g @rootbeer/zero
zero schema.graphql
```
Then swap out the URL in your frontend code with
```
http://localhost:9000
```

Note: We don't support persisted queries yet

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

- [x] Runs as local graphql server
- [x] queries
- [ ] persisted queries
- [ ] field arguments and AI inferred business logic!
- [ ] Support for proxying existing GraphQL API and extending it with faked data
- [ ] custom scalars (starting with popular standards)
- [ ] directives (starting with popular standards)
- [ ] mutations (including file uploads and auth)
- [ ] subscriptions
- [ ] prompting for more control
- [ ] graphql connections spec

## How it works

This CLI tool sends our server an introspection AST of your GraphQL SDL (including docstrings). Our server runs fancy AI algorithms to create a blob of mock data, which gets sent back to the CLI tool. From then on, all queries are executed locally on your machine. We mock at the GraphQL level so it's data source agnostic and client agnostic (Apollo, iOS, Java, etc).

## Contribute

All PRs will be reviewed within 24 hours!

I'd especially appreciate bugfixes, examples, tests, federation support, quality of life improvements, and render/heroku/docker build things!

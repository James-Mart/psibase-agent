---
name: graphql
description: >-
  Make authenticated GraphQL queries to psibase services via curl.
  Use when the user asks to query a service's GraphQL API, fetch data
  from a psibase service, or run a GraphQL query against a running psinode.
---

# Psibase GraphQL curl

Use `/check-psinode` first to confirm psinode is running and get the listen port.

## Quick start

Run the helper script:

```bash
bash .cursor/skills/graphql/scripts/psibase-gql.sh <service> '<query>' [--user <account>] [--port <port>]
```

The script auto-detects the port from the running psinode process, handles bearer-token login when `--user` is given, and pretty-prints the JSON response.

## Examples

Unauthenticated query (billing config from virtual-server):

```bash
bash .cursor/skills/graphql/scripts/psibase-gql.sh \
  virtual-server '{ getBillingConfig { enabled } }'
```

Authenticated query (consumed history for a user):

```bash
bash .cursor/skills/graphql/scripts/psibase-gql.sh \
  virtual-server '{ consumedHistory(account: "myprod", first: 10) { edges { node { block { blockNum blockTime } account resource amount cost } } pageInfo { hasNextPage endCursor } } }' \
  --user myprod
```

## Fetching a service's SDL schema

A `GET` to `/graphql` returns the SDL. Use this to discover available queries:

```bash
curl -s "http://<service>.psibase.localhost:<port>/graphql"
```

## Tips

- Use `first`/`last`/`before`/`after` args for Relay-style pagination on event history queries.
- The GraphiQL UI is available at `http://<service>.psibase.localhost:<port>/graphiql`.

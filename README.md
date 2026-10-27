# Hotel yes/no agent

A local page that answers hotel questions from a Neo4j graph. Neo4j returns the matching hotel facts. [Jev](https://typesafe.ai) (`jev-latest` through `@typesafe-ai/sdk`) decides yes, no, or not in the record from those facts only.

Pick one hotel and ask a yes/no question, such as whether it has babysitting or allows 5 guests. Or choose **All hotels** and ask which hotels match, such as which hotels have a pool. The graph search uses hotel relationships — amenities, services, policies, and rooms — and sends Jev only the matching snippets.

## Requirements

- Node.js 22 or newer
- A TypeSafe API key
- The workshop Neo4j dump at `data/neo4j.dump`
- Docker, or a Mac that can run the local Neo4j fallback

## Setup

```bash
npm install
cp .env.example .env
```

Put your TypeSafe API key in `.env` as `TYPESAFE_API_KEY`. The Neo4j password in `.env.example` is `hotel-local`.

Copy the dump to `data/neo4j.dump`, then load it:

```bash
npm run neo4j:load
```

That uses Docker Compose when the Docker daemon is up (`neo4j:2026.10.1` on `127.0.0.1:7474` and `127.0.0.1:7687`). If Docker is not running, the script downloads Temurin 21 and Neo4j Community 2026.10.1 into `.tools/` and loads the dump there. The JDK download is the macOS Apple Silicon build.

Start the page:

```bash
npm run dev
```

Open http://127.0.0.1:3000.

## Questions

One hotel:

- Does this hotel have babysitting?
- Does this hotel allow 5 guests?
- Does this hotel have a cancellation policy?

Across the graph, with **All hotels** selected or with hotel names written in the question:

- Which hotels have a pool?
- Which of the following hotels has a pool: Acorn City Suites or Adobe Plaza Inn?
- Do all hotels have a pool?

Open questions such as “what”, “why”, “how”, or “which amenities does this hotel have?” are refused. A catalog question needs something to look for, such as an amenity or a guest count.

Jev answers **Yes**, **No**, or **Not in the record**. For a “which hotels” question the labels are **These hotels** and **None**. Confidence below 0.6 is marked for review. The page shows the records that were retrieved. A catalog search reports how many hotels matched and shows the first 40.

## Tests

```bash
npm test
```

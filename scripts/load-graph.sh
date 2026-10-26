#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

export PATH="/Applications/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:${PATH}"

if [[ ! -f data/neo4j.dump ]]; then
  echo "Missing data/neo4j.dump. Copy the workshop dump there first." >&2
  exit 1
fi

password="hotel-local"
if [[ -f .env ]]; then
  env_password="$(grep -E '^NEO4J_PASSWORD=' .env | head -1 | cut -d= -f2- || true)"
  if [[ -n "${env_password}" ]]; then
    password="${env_password}"
  fi
fi

hero='MATCH (hotel:Hotel {name: "AnyCompany Cairo Nile View"}) RETURN hotel.name AS name, hotel.address AS address'

docker_ready() {
  [[ -S "${HOME}/.docker/run/docker.sock" ]] && docker info >/dev/null 2>&1
}

if docker_ready; then
  echo "Loading the dump with Docker Compose..."
  docker compose stop neo4j >/dev/null 2>&1 || true
  docker compose run --rm --no-deps load
  docker compose up -d neo4j

  echo "Waiting for Neo4j..."
  ready=0
  for _ in $(seq 1 40); do
    if docker compose exec -T neo4j cypher-shell -u neo4j -p "${password}" "RETURN 1" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 3
  done
  if [[ "${ready}" -ne 1 ]]; then
    echo "Neo4j did not accept connections in time." >&2
    docker compose logs neo4j --tail 40 >&2 || true
    exit 1
  fi
  docker compose exec -T neo4j cypher-shell -u neo4j -p "${password}" "${hero}"
  exit 0
fi

echo "Docker is not running. Loading the dump with the local Neo4j runtime..."

tools="${root}/.tools"
mkdir -p "${tools}"

if [[ ! -x "${tools}/jdk/bin/java" && ! -x "${tools}/jdk/Contents/Home/bin/java" ]]; then
  echo "Downloading Temurin 21..."
  curl -fsSL -o "${tools}/jdk.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
  tar -xzf "${tools}/jdk.tar.gz" -C "${tools}"
  rm -f "${tools}/jdk.tar.gz"
  extracted="$(find "${tools}" -maxdepth 1 -type d -name 'jdk-21*' | head -1)"
  rm -rf "${tools}/jdk"
  mv "${extracted}" "${tools}/jdk"
fi

if [[ -x "${tools}/jdk/Contents/Home/bin/java" ]]; then
  export JAVA_HOME="${tools}/jdk/Contents/Home"
else
  export JAVA_HOME="${tools}/jdk"
fi

if [[ ! -x "${tools}/neo4j/bin/neo4j-admin" ]]; then
  echo "Downloading Neo4j 2026.10.1..."
  curl -fsSL -o "${tools}/neo4j.tar.gz" \
    "https://dist.neo4j.org/neo4j-community-2026.10.1-unix.tar.gz"
  tar -xzf "${tools}/neo4j.tar.gz" -C "${tools}"
  rm -f "${tools}/neo4j.tar.gz"
  extracted="$(find "${tools}" -maxdepth 1 -type d -name 'neo4j-community-*' | head -1)"
  rm -rf "${tools}/neo4j"
  mv "${extracted}" "${tools}/neo4j"
fi

export NEO4J_HOME="${tools}/neo4j"
"${NEO4J_HOME}/bin/neo4j" stop >/dev/null 2>&1 || true

echo "Loading neo4j.dump..."
"${NEO4J_HOME}/bin/neo4j-admin" database load neo4j \
  --from-path="${root}/data" \
  --overwrite-destination=true

if [[ ! -d "${NEO4J_HOME}/data/databases/system" ]]; then
  "${NEO4J_HOME}/bin/neo4j-admin" dbms set-initial-password "${password}"
fi

"${NEO4J_HOME}/bin/neo4j" start

echo "Waiting for Neo4j..."
ready=0
for _ in $(seq 1 40); do
  if "${NEO4J_HOME}/bin/cypher-shell" -u neo4j -p "${password}" -a bolt://127.0.0.1:7687 "RETURN 1" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done

if [[ "${ready}" -ne 1 ]]; then
  echo "Neo4j did not accept connections in time." >&2
  "${NEO4J_HOME}/bin/neo4j" console || true
  exit 1
fi

"${NEO4J_HOME}/bin/cypher-shell" -u neo4j -p "${password}" -a bolt://127.0.0.1:7687 "${hero}"

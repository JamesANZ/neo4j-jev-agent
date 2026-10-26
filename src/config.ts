export type AppConfig = {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
  typesafeApiKey: string;
  jevModel: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3000);
  return {
    neo4jUri: env.NEO4J_URI?.trim() || "bolt://127.0.0.1:7687",
    neo4jUsername: env.NEO4J_USERNAME?.trim() || "neo4j",
    neo4jPassword: env.NEO4J_PASSWORD?.trim() || "hotel-local",
    neo4jDatabase: env.NEO4J_DATABASE?.trim() || "neo4j",
    typesafeApiKey: env.TYPESAFE_API_KEY?.trim() || "",
    jevModel: env.JEV_MODEL?.trim() || "jev-latest",
    port: Number.isInteger(port) && port > 0 ? port : 3000,
  };
}

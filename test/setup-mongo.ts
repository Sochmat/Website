import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";

export async function withMemoryMongo(): Promise<{
  db: Db;
  cleanup: () => Promise<void>;
}> {
  const server = await MongoMemoryServer.create();
  const client = await MongoClient.connect(server.getUri());
  const db = client.db("kitchenos_test");
  return {
    db,
    cleanup: async () => {
      await client.close();
      await server.stop();
    },
  };
}

import { connectToDatabase } from "./mongodb";

export async function tenantIdForPrintToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const { db } = await connectToDatabase();
  const t = await db.collection("tenants").findOne(
    { "integrations.printAgentToken": token, status: "active" },
    { projection: { _id: 1 } },
  );
  return t ? String(t._id) : null;
}

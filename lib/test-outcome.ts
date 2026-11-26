import type { PoolClient } from "pg";

type TestTradeSource = "REAL_SIM";

export async function assignTestOutcome(
  client: PoolClient,
  source: TestTradeSource,
  tradeId: string,
  individualWin: boolean,
  email: string
): Promise<boolean> {
  const isJimmy =
    email.trim().toLowerCase() === "jimmy@gmail.com";

  const result = await client.query(
    `SELECT public.assign_test_outcome(
       $1::text,
       $2::uuid,
       $3::boolean,
       $4::boolean
     ) AS won`,
    [source, tradeId, individualWin, isJimmy]
  );

  const won = result.rows[0]?.won;

  if (typeof won !== "boolean") {
    throw new Error("Could not assign shared test outcome.");
  }

  return won;
}

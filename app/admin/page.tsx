"use client";

import { useEffect, useState } from "react";

type AdminData = {
  stats: {
    total_users: number;
    administrators: number;
    demo_balance_total: string;
  };
  users: {
    id: string;
    email: string;
    display_name: string;
    role: string;
    created_at: string;
    demo_balance: string;
  }[];
};
type ActivityData = {
  stats: {
    total_trades: number;
    pending: number;
    won: number;
    lost: number;
    cancelled: number;
  };
  trades: {
    id: string;
    asset: string;
    direction: string;
    contract_type: string;
    contract_prediction: string | null;
    amount: string;
    status: string;
    simulated_result: string | null;
    created_at: string;
    settled_at: string | null;
    email: string;
    display_name: string;
  }[];
  transactions: {
    id: string;
    wallet_type: string;
    transaction_type: string;
    amount: string;
    note: string | null;
    created_at: string;
    email: string;
    display_name: string;
  }[];
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await fetch("/api/admin/overview", {
          credentials: "include",
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Unable to access admin dashboard.");
        }

        setData(result);
        const activityResponse = await fetch("/api/admin/activity", {
  credentials: "include",
  cache: "no-store",
});

const activityResult = await activityResponse.json();

if (!activityResponse.ok) {
  throw new Error(activityResult.error || "Unable to load trading activity.");
}

setActivity(activityResult);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-[#070b14] text-white p-5 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.3em] text-cyan-400">
              AUREVEX
            </p>
            <h1 className="mt-2 text-3xl font-bold">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-400">
              Platform overview and user management
            </p>
          </div>

          <a
            href="/"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800"
          >
            Back to platform
          </a>
        </header>

        {loading && (
          <p className="text-gray-400">Loading administrator data...</p>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                title="Total users"
                value={data.stats.total_users}
              />
              <StatCard
                title="Administrators"
                value={data.stats.administrators}
              />
              <StatCard
                title="Total demo balance"
                value={Number(
                  data.stats.demo_balance_total
                ).toLocaleString()}
              />
            </section>

            <section className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Registered users</h2>
                <span className="text-sm text-gray-400">
                  Latest {data.users.length} accounts
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-[#111827] text-gray-400">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Demo balance</th>
                      <th className="p-4">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-t border-gray-800"
                      >
                        <td className="p-4 font-medium">
                          {user.display_name || "Unnamed"}
                        </td>
                        <td className="p-4 text-gray-300">
                          {user.email}
                        </td>
                        <td className="p-4">
                          <span
                            className={
                              user.role === "ADMIN"
                                ? "rounded-full bg-cyan-500/15 px-3 py-1 text-cyan-300"
                                : "rounded-full bg-gray-700 px-3 py-1 text-gray-300"
                            }
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="p-4">
                          {Number(user.demo_balance).toLocaleString()}
                        </td>
                        <td className="p-4 text-gray-400">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {data.users.length === 0 && (
                  <p className="p-6 text-gray-400">No users found.</p>
                )}
              </div>
            </section>
         <section className="mt-10">
  <h2 className="mb-4 text-xl font-bold">
    Demo Trading Activity
  </h2>

  {activity ? (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total trades"
          value={activity.stats.total_trades}
        />
        <StatCard
          title="Pending"
          value={activity.stats.pending}
        />
        <StatCard
          title="Won"
          value={activity.stats.won}
        />
        <StatCard
          title="Lost"
          value={activity.stats.lost}
        />
        <StatCard
          title="Cancelled"
          value={activity.stats.cancelled}
        />
      </div>

      <h3 className="mt-8 mb-4 text-lg font-semibold">
        Recent Demo Trades
      </h3>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-[#111827] text-gray-400">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Asset</th>
              <th className="p-4">Direction</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Status</th>
              <th className="p-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {activity.trades.map((trade) => (
              <tr key={trade.id} className="border-t border-gray-800">
                <td className="p-4">
                  {trade.display_name || trade.email}
                </td>
                <td className="p-4">{trade.asset}</td>
                <td className="p-4">{trade.direction}</td>
                <td className="p-4">{Number(trade.amount).toLocaleString()}</td>
                <td className="p-4">{trade.status}</td>
                <td className="p-4 text-gray-400">
                  {new Date(trade.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {activity.trades.length === 0 && (
          <p className="p-5 text-gray-400">No demo trades found.</p>
        )}
      </div>

      <h3 className="mt-8 mb-4 text-lg font-semibold">
        Recent Demo Transactions
      </h3>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-[#111827] text-gray-400">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Type</th>
              <th className="p-4">Wallet</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {activity.transactions.map((transaction) => (
              <tr key={transaction.id} className="border-t border-gray-800">
                <td className="p-4">
                  {transaction.display_name || transaction.email}
                </td>
                <td className="p-4">{transaction.transaction_type}</td>
                <td className="p-4">{transaction.wallet_type}</td>
                <td className="p-4">
                  {Number(transaction.amount).toLocaleString()}
                </td>
                <td className="p-4 text-gray-400">
                  {new Date(transaction.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {activity.transactions.length === 0 && (
          <p className="p-5 text-gray-400">No demo transactions found.</p>
        )}
      </div>
    </>
  ) : (
    <p className="text-gray-400">Loading trading activity...</p>
  )}
</section>

          </>
        )}
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#111827] p-6">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-cyan-300">{value}</p>
    </div>
  );
}

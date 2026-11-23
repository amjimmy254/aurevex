"use client";

import { useState } from "react";

export default function WithdrawalTestForm() {
  const [amount, setAmount] = useState("10");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestKey, setRequestKey] = useState("");

  async function submitTest() {
    const kes = Number(amount);

    if (!Number.isSafeInteger(kes) || kes < 10) {
      setMessage("Minimum test withdrawal is KES 10.");
      return;
    }

    setLoading(true);
    setMessage("");

    const key = requestKey || crypto.randomUUID();
    setRequestKey(key);

    try {
      const response = await fetch("/api/palpluss/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: kes * 100,
          phone,
          idempotencyKey: key
        })
      });

      const data = await response.json();
      setMessage(JSON.stringify(data, null, 2));

      if (response.ok) setRequestKey("");
    } catch {
      setMessage("Request failed. Retry using the same request key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", padding: 20 }}>
      <h1>Palpluss Withdrawal Test</h1>
      <p>
        Preview testing only. Submitting reserves funds in the test
        wallet. No M-Pesa payout will be sent.
      </p>

      <label>Amount (KES)</label>
      <input
        type="number"
        min="10"
        step="1"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 18px" }}
      />

      <label>M-Pesa phone number</label>
      <input
        type="tel"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        placeholder="07XXXXXXXX"
        style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 18px" }}
      />

      <button
        type="button"
        disabled={loading}
        onClick={submitTest}
        style={{ padding: 14, width: "100%" }}
      >
        {loading ? "SUBMITTING..." : "SUBMIT TEST REQUEST"}
      </button>

      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 20 }}>
        {message}
      </pre>
    </main>
  );
}

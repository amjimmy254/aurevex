const promotionalCreditResult = await db.query(
      `SELECT COALESCE(SUM(amount_cents), 0) AS promotional_credit_cents
       FROM real_wallet_promotional_credits
       WHERE user_id = $1
         AND status = 'ACTIVE'
         AND credit_type = 'DISPLAY_ONLY'
         AND currency = 'USD'`,
      [userId]
    );

    return NextResponse.json(
      {
        availableBalance: Number(result.rows[0].available_balance),
        displayOffsetUSD:
          Number(promotionalCreditResult.rows[0]?.promotional_credit_cents ?? 0) / 100,
        reservedBalance: Number(result.rows[0].reserved_balance),
        currency: result.rows[0].currency,
        isFrozen: result.rows[0].is_frozen,
        reversalDue: Number(result.rows[0].reversal_due),
        accountType: "REAL"
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );

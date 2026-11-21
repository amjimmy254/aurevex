export type WithdrawalDecision = "APPROVE" | "DECLINE" | "REVIEW";

export type WithdrawalCheckInput = {
  amountKes: number;
  availableBalanceKes: number;
  reversalDebtKes: number;
  dailyLimitRemainingKes: number;
  accountStatus: "ACTIVE" | "SUSPENDED" | "CLOSED" | "UNKNOWN";
  kycStatus: "VERIFIED" | "REJECTED" | "PENDING" | "UNKNOWN";
  riskStatus: "CLEAR" | "BLOCKED" | "REVIEW" | "UNKNOWN";
  payoutProviderStatus: "READY" | "UNAVAILABLE" | "UNKNOWN";
  complianceEnabled: boolean;
};

export function evaluateWithdrawal(
  input: WithdrawalCheckInput
): { decision: WithdrawalDecision; reason: string } {
  if (
    !Number.isFinite(input.amountKes) ||
    input.amountKes <= 0 ||
    !Number.isFinite(input.availableBalanceKes) ||
    !Number.isFinite(input.reversalDebtKes) ||
    !Number.isFinite(input.dailyLimitRemainingKes)
  ) {
    return { decision: "DECLINE", reason: "Invalid wallet values." };
  }

  if (["SUSPENDED", "CLOSED"].includes(input.accountStatus)) {
    return { decision: "DECLINE", reason: "Account is not eligible." };
  }

  if (input.kycStatus === "REJECTED") {
    return { decision: "DECLINE", reason: "Identity verification rejected." };
  }

  if (input.riskStatus === "BLOCKED") {
    return { decision: "DECLINE", reason: "Risk controls blocked withdrawal." };
  }

  if (input.reversalDebtKes > 0) {
    return { decision: "DECLINE", reason: "Outstanding reversal debt." };
  }

  if (input.amountKes > input.availableBalanceKes) {
    return { decision: "DECLINE", reason: "Insufficient balance." };
  }

  if (input.amountKes > input.dailyLimitRemainingKes) {
    return { decision: "DECLINE", reason: "Daily limit exceeded." };
  }

  if (
    input.accountStatus !== "ACTIVE" ||
    input.kycStatus !== "VERIFIED" ||
    input.riskStatus !== "CLEAR" ||
    input.payoutProviderStatus !== "READY" ||
    input.complianceEnabled !== true
  ) {
    return {
      decision: "REVIEW",
      reason: "Required checks are incomplete."
    };
  }

  return {
    decision: "APPROVE",
    reason: "All eligibility checks passed. Payout is a separate operation."
  };
}

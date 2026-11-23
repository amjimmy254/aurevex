import { notFound } from "next/navigation";
import WithdrawalTestForm from "./WithdrawalTestForm";

export default function WithdrawalTestPage() {
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "test/palpluss-withdrawals"
  ) {
    notFound();
  }

  return <WithdrawalTestForm />;
}

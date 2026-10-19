"use client";

import { useState, useTransition } from "react";
import type { PortalResult } from "./actions";

// Two buttons for a yes/no answer, e.g. "I'll attend" / "I can't make it".
export function AnswerButtons({
  current,
  yes,
  no,
  onAnswer,
}: {
  current: "yes" | "no" | null;
  yes: string;
  no: string;
  onAnswer: (answer: "yes" | "no") => Promise<PortalResult>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answer = (value: "yes" | "no") =>
    start(async () => {
      const result = await onAnswer(value);
      setError(result.ok ? null : result.error);
    });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-pressed={current === "yes"}
        className={current === "yes" ? "btn bg-green-600 py-1 text-white" : "btn-secondary py-1"}
        onClick={() => answer("yes")}
      >
        {yes}
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={current === "no"}
        className={current === "no" ? "btn bg-slate-700 py-1 text-white" : "btn-secondary py-1"}
        onClick={() => answer("no")}
      >
        {no}
      </button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </span>
  );
}

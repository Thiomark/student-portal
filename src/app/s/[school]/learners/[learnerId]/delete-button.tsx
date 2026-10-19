"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteLearner } from "../actions";

export function DeleteLearnerButton({ slug, learnerId }: { slug: string; learnerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this learner? Their history is kept in the activity log.")) return;
        start(async () => {
          const result = await deleteLearner(slug, learnerId);
          if (result?.ok === false) alert(result.error);
          else if (result?.ok && result.redirectTo) router.push(result.redirectTo);
        });
      }}
    >
      Remove
    </button>
  );
}

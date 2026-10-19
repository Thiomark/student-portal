// Wire format between an offline device and /api/s/[school]/sync. Shared by
// the server and the browser, so no server-only imports here.

export type BookCondition = "new" | "good" | "fair" | "poor" | "damaged";
export const BOOK_CONDITIONS: BookCondition[] = ["new", "good", "fair", "poor", "damaged"];

export type SyncLearner = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  admissionNumber: string | null;
  className: string | null;
  // Lower-cased "first last preferred admission" for local search.
  search: string;
};

export type SyncCopy = {
  id: string;
  copyNumber: string;
  // Upper-cased copy number; the desk looks books up by what's typed or scanned.
  key: string;
  titleId: string;
  title: string;
  condition: BookCondition;
  status: "available" | "issued" | "lost" | "written_off";
};

export type SyncLoan = {
  id: string;
  copyId: string;
  learnerId: string;
  issuedAt: string;
  conditionOut: BookCondition;
};

export type PullResponse = {
  // Pass back as `cursor` on the next pull.
  cursor: string;
  full: boolean;
  learners: SyncLearner[];
  removedLearnerIds: string[];
  copies: SyncCopy[];
  removedCopyIds: string[];
  // Open loans changed since the cursor; closedLoanIds were returned.
  loans: SyncLoan[];
  closedLoanIds: string[];
};

export type Mutation =
  | {
      id: string;
      kind: "loan.issue";
      at: string;
      payload: { loanId: string; copyId: string; learnerId: string; conditionOut: BookCondition };
    }
  | {
      id: string;
      kind: "loan.return";
      at: string;
      payload: { copyId: string; conditionIn: BookCondition; outcome: "returned" | "lost" | "damaged" };
    };

export type PushRequest = { deviceId: string; mutations: Mutation[] };

export type MutationResult = {
  id: string;
  // "duplicate": already applied by an earlier push that lost its response.
  status: "applied" | "duplicate" | "rejected";
  error?: string;
};

export type PushResponse = { results: MutationResult[] };

export const MAX_PUSH = 200;

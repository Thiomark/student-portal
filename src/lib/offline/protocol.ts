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
  classGroupId: string | null;
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

export type SyncClass = {
  id: string;
  name: string;
  gradeName: string;
  gradeSort: number;
  teacherStaffId: string | null;
};

export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export type SyncRegister = { id: string; classGroupId: string; date: string; takenAt: string };

export type SyncAttendance = {
  // `${learnerId}:${date}`, so a device keeps one mark per learner per day.
  key: string;
  learnerId: string;
  date: string;
  status: AttendanceStatus;
  reason: string | null;
};

// Which parts of the snapshot this person may have on their device.
export type SyncScope = { textbooks: boolean; attendance: boolean };

export type PullResponse = {
  // Pass back as `cursor` on the next pull.
  cursor: string;
  full: boolean;
  scope: SyncScope;
  // The school's "today" (YYYY-MM-DD in its timezone), for registers.
  today: string;
  learners: SyncLearner[];
  removedLearnerIds: string[];
  // Always the full list for the current year; it's small.
  classes: SyncClass[];
  copies: SyncCopy[];
  removedCopyIds: string[];
  // Open loans changed since the cursor; closedLoanIds were returned.
  loans: SyncLoan[];
  closedLoanIds: string[];
  // Registers and marks from the last ATTENDANCE_DAYS days.
  registers: SyncRegister[];
  attendance: SyncAttendance[];
};

export const ATTENDANCE_DAYS = 14;

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
    }
  | {
      id: string;
      kind: "attendance.submit";
      at: string;
      payload: {
        registerId: string;
        classGroupId: string;
        date: string;
        marks: { learnerId: string; status: AttendanceStatus; reason?: string | null }[];
        // Tell parents of learners marked absent (only for today's register).
        notifyAbsences: boolean;
      };
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

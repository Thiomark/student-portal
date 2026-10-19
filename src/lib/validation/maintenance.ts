import { z } from "zod";
import { rands } from "./trips";

// Shared by server actions and forms.

const optionalText = (max = 200) => z.string().trim().max(max).optional();

export const MAINTENANCE_CATEGORIES = [
  "electrical",
  "plumbing",
  "building",
  "furniture",
  "it",
  "grounds",
  "security",
  "other",
] as const;

export const MAINTENANCE_CATEGORY_LABELS: Record<(typeof MAINTENANCE_CATEGORIES)[number], string> = {
  electrical: "Electrical",
  plumbing: "Plumbing",
  building: "Building",
  furniture: "Furniture",
  it: "IT",
  grounds: "Grounds",
  security: "Security",
  other: "Other",
};

export const MAINTENANCE_PRIORITIES = ["low", "normal", "urgent"] as const;
export const MAINTENANCE_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

// Allowed moves; a finished or cancelled job can be reopened.
export const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, readonly MaintenanceStatus[]> = {
  open: ["in_progress", "done", "cancelled"],
  in_progress: ["open", "done", "cancelled"],
  done: ["open"],
  cancelled: ["open"],
};

export const maintenanceInput = z.object({
  title: z.string().trim().min(1, "Required").max(200),
  description: optionalText(5000),
  location: optionalText(200),
  category: z.enum(MAINTENANCE_CATEGORIES, "Pick a category"),
  priority: z.enum(MAINTENANCE_PRIORITIES).default("normal"),
});

export const maintenanceUpdateInput = z.object({
  status: z.enum(MAINTENANCE_STATUSES),
  category: z.enum(MAINTENANCE_CATEGORIES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  assignedTo: optionalText(200),
  vendor: optionalText(200),
  cost: rands.optional(),
});

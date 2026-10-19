// Turns a learners-and-parents spreadsheet into validated rows. Pure (no
// database), so the preview and the import read a file the same way and it
// can be unit tested.

import { toE164 } from "@/lib/phone";
import { RELATIONSHIPS } from "@/lib/validation/people";
import { parseCsv } from "./csv";

export const MAX_IMPORT_ROWS = 2000;

type Relationship = (typeof RELATIONSHIPS)[number];

export type ImportedParent = {
  firstName: string;
  lastName: string;
  relationship: Relationship;
  phone: string | null;
  // Whether the phone number takes WhatsApp. Defaults to yes for cellphones.
  whatsapp: boolean;
  email: string | null;
};

export type ImportedLearner = {
  admissionNumber: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: "female" | "male" | "other" | null;
  idNumber: string | null;
  homeLanguage: string | null;
  className: string | null;
  parents: ImportedParent[];
};

export type ImportRow = {
  // Spreadsheet row number (header is row 1), for messages people can find.
  line: number;
  learner: ImportedLearner | null;
  errors: string[];
  warnings: string[];
};

export type ParsedImport = {
  rows: ImportRow[];
  // Headers we didn't recognise; shown so people can rename a column.
  ignoredColumns: string[];
  missingColumns: string[];
};

// Field → accepted header spellings (compared lower-cased, without spaces,
// dots, dashes or underscores).
const FIELDS = {
  admissionNumber: ["admissionnumber", "admissionno", "admno", "learnernumber", "learnerno", "studentnumber", "accessionnumber"],
  firstName: ["firstname", "firstnames", "name", "learnerfirstname", "forename", "forenames"],
  lastName: ["surname", "lastname", "learnersurname", "familyname"],
  preferredName: ["preferredname", "knownas", "nickname"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate"],
  gender: ["gender", "sex"],
  idNumber: ["idnumber", "idno", "id", "saidnumber"],
  homeLanguage: ["homelanguage", "language"],
  className: ["class", "classname", "register", "registerclass"],
} as const;

const PARENT_FIELDS = {
  firstName: ["firstname", "name"],
  lastName: ["surname", "lastname"],
  relationship: ["relationship", "relation"],
  phone: ["cell", "cellphone", "phone", "mobile", "cellnumber", "contactnumber", "tel"],
  whatsapp: ["whatsapp"],
  email: ["email", "emailaddress"],
} as const;

const normaliseHeader = (h: string) => h.toLowerCase().replace(/[\s._\-/()]+/g, "");

type Column = { field: string; parent?: number };

// "Parent 1 Cell", "P2 Email", "Guardian1Surname", "Mother Cell" → parent fields.
function matchColumn(header: string): Column | null {
  const h = normaliseHeader(header);
  for (const [field, aliases] of Object.entries(FIELDS)) {
    if ((aliases as readonly string[]).includes(h)) return { field };
  }
  const prefixed = h.match(/^(?:parent|guardian|p|contact)([12])(.+)$/);
  const byRole = h.match(/^(mother|father)(.+)$/);
  const parent = prefixed ? Number(prefixed[1]) : byRole ? (byRole[1] === "mother" ? 1 : 2) : 0;
  const rest = prefixed?.[2] ?? byRole?.[2];
  if (parent && rest) {
    for (const [field, aliases] of Object.entries(PARENT_FIELDS)) {
      if ((aliases as readonly string[]).includes(rest)) {
        return { field, parent };
      }
    }
  }
  return null;
}

export function parseLearnerImport(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], ignoredColumns: [], missingColumns: ["first name", "surname"] };

  const [header, ...body] = table;
  const columns = header.map(matchColumn);
  const ignoredColumns = header.filter((h, i) => !columns[i] && h.trim() !== "");
  const has = (field: string) => columns.some((c) => c && !c.parent && c.field === field);
  const missingColumns = [
    has("firstName") ? null : "first name",
    has("lastName") ? null : "surname",
  ].filter((x): x is string => x !== null);
  // "Mother Cell" implies the relationship.
  const roleRelationship = new Map<number, Relationship>();
  header.forEach((h) => {
    const m = normaliseHeader(h).match(/^(mother|father)/);
    if (m) roleRelationship.set(m[1] === "mother" ? 1 : 2, m[1] as Relationship);
  });

  const rows: ImportRow[] = body.slice(0, MAX_IMPORT_ROWS).map((cells, index) => {
    const line = index + 2;
    const get = (field: string, parent?: number) => {
      const i = columns.findIndex((c) => c?.field === field && c.parent === parent);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    const firstName = get("firstName");
    const lastName = get("lastName");
    if (!firstName) errors.push("First name is missing");
    if (!lastName) errors.push("Surname is missing");

    const dobRaw = get("dateOfBirth");
    const dateOfBirth = dobRaw ? parseDate(dobRaw) : null;
    if (dobRaw && !dateOfBirth) warnings.push(`Date of birth "${dobRaw}" not understood; left empty`);

    const genderRaw = get("gender").toLowerCase();
    const gender = genderRaw
      ? genderRaw.startsWith("f")
        ? "female"
        : genderRaw.startsWith("m")
          ? "male"
          : "other"
      : null;

    const parents: ImportedParent[] = [];
    for (const n of [1, 2]) {
      const p = {
        firstName: get("firstName", n),
        lastName: get("lastName", n),
        relationship: get("relationship", n),
        phone: get("phone", n),
        whatsapp: get("whatsapp", n),
        email: get("email", n),
      };
      if (!Object.values(p).some(Boolean)) continue;
      const phone = p.phone ? toE164(p.phone) : null;
      if (p.phone && !phone) warnings.push(`Parent ${n} phone "${p.phone}" not understood; left out`);
      const email = p.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email) ? p.email.toLowerCase() : null;
      if (p.email && !email) warnings.push(`Parent ${n} email "${p.email}" not understood; left out`);
      if (!p.firstName && !p.lastName) {
        warnings.push(`Parent ${n} has contact details but no name; saved as "Parent ${lastName}"`);
      }
      parents.push({
        firstName: p.firstName || "Parent",
        lastName: p.lastName || lastName,
        relationship: parseRelationship(p.relationship) ?? roleRelationship.get(n) ?? "guardian",
        phone,
        // Most South African cellphone numbers have WhatsApp; a blank column
        // means yes, "N"/"No" means no. Landlines (+2710–+2759) never do.
        whatsapp: Boolean(phone) && !/^(n|no|false|0)$/i.test(p.whatsapp) && !isLandline(phone!),
        email,
      });
    }

    const learner: ImportedLearner | null = errors.length
      ? null
      : {
          admissionNumber: get("admissionNumber") || null,
          firstName,
          lastName,
          preferredName: get("preferredName") || null,
          dateOfBirth,
          gender,
          idNumber: get("idNumber") || null,
          homeLanguage: get("homeLanguage") || null,
          className: get("className") || null,
          parents,
        };
    return { line, learner, errors, warnings };
  });

  if (body.length > MAX_IMPORT_ROWS) {
    rows.push({
      line: MAX_IMPORT_ROWS + 2,
      learner: null,
      errors: [`Only the first ${MAX_IMPORT_ROWS} rows are imported at a time; split the file`],
      warnings: [],
    });
  }

  // The same admission number twice in one file is almost always a mistake.
  const seen = new Map<string, number>();
  for (const row of rows) {
    const adm = row.learner?.admissionNumber?.toUpperCase();
    if (!adm) continue;
    const first = seen.get(adm);
    if (first) {
      row.errors.push(`Admission number ${row.learner!.admissionNumber} is also on row ${first}`);
      row.learner = null;
    } else {
      seen.set(adm, row.line);
    }
  }

  return { rows, ignoredColumns, missingColumns };
}

// YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY (South African order).
export function parseDate(value: string): string | null {
  let y: number, m: number, d: number;
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1990 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

function parseRelationship(value: string): Relationship | null {
  const v = value.toLowerCase().trim();
  if (!v) return null;
  if (["mother", "mom", "mum", "ma"].includes(v)) return "mother";
  if (["father", "dad", "pa"].includes(v)) return "father";
  if (v.startsWith("grand") || v === "gogo" || v === "oupa" || v === "ouma") return "grandparent";
  if (v.startsWith("foster")) return "foster_parent";
  if (v === "sister" || v === "brother" || v === "sibling") return "sibling";
  if (v.startsWith("guardian")) return "guardian";
  return (RELATIONSHIPS as readonly string[]).includes(v) ? (v as Relationship) : "other";
}

// South African geographic (landline) numbers: 010–059 area codes.
export function isLandline(e164: string): boolean {
  return /^\+27[1-5]\d{8}$/.test(e164);
}

export const TEMPLATE_HEADERS = [
  "Admission number",
  "First name",
  "Surname",
  "Preferred name",
  "Date of birth",
  "Gender",
  "Class",
  "Home language",
  "Parent 1 first name",
  "Parent 1 surname",
  "Parent 1 relationship",
  "Parent 1 cell",
  "Parent 1 WhatsApp",
  "Parent 1 email",
  "Parent 2 first name",
  "Parent 2 surname",
  "Parent 2 relationship",
  "Parent 2 cell",
  "Parent 2 WhatsApp",
  "Parent 2 email",
];

export const TEMPLATE_EXAMPLE = [
  "2027001",
  "Thabo",
  "Mokoena",
  "",
  "14/03/2014",
  "M",
  "8A",
  "isiZulu",
  "Nomsa",
  "Mokoena",
  "Mother",
  "082 123 4567",
  "Y",
  "",
  "Sipho",
  "Mokoena",
  "Father",
  "011 555 0000",
  "N",
  "sipho@example.com",
];

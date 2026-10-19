import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";
import { parseDate, parseLearnerImport } from "./learners";

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
  it("detects Excel's semicolon CSV and strips the BOM", () => {
    const text = "﻿First name;Surname\nThabo;Mokoena\n";
    expect(detectDelimiter(text)).toBe(";");
    expect(parseCsv(text)).toEqual([
      ["First name", "Surname"],
      ["Thabo", "Mokoena"],
    ]);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n,\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseDate", () => {
  it("reads ISO and South African day-first dates", () => {
    expect(parseDate("2014-03-14")).toBe("2014-03-14");
    expect(parseDate("14/03/2014")).toBe("2014-03-14");
    expect(parseDate("4.3.2014")).toBe("2014-03-04");
  });
  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2014")).toBeNull();
    expect(parseDate("03/14/2014")).toBeNull();
    expect(parseDate("yesterday")).toBeNull();
  });
});

describe("parseLearnerImport", () => {
  const csv = [
    "Adm No;Name;Surname;DOB;Sex;Class;Mother Cell;Mother Name;Father Cell;Father WhatsApp;Father Email;Favourite colour",
    "2027001;Thabo;Mokoena;14/03/2014;M;8A;082 123 4567;Nomsa;011 555 0000;;sipho@example.com;blue",
    ";Lerato;;2014-01-01;F;8B;;;;;;",
    "2027003;Sipho;Nkosi;31/02/2014;m;;083 000 1111;;;N;not-an-email;",
    "2027001;Dup;Licate;;;;;;;;;",
  ].join("\n");
  const result = parseLearnerImport(csv);

  it("maps common header spellings, including mother/father columns", () => {
    expect(result.missingColumns).toEqual([]);
    expect(result.ignoredColumns).toEqual(["Favourite colour"]);
    const thabo = result.rows[0].learner!;
    expect(thabo).toMatchObject({
      admissionNumber: "2027001",
      firstName: "Thabo",
      lastName: "Mokoena",
      dateOfBirth: "2014-03-14",
      gender: "male",
      className: "8A",
    });
    expect(thabo.parents).toEqual([
      { firstName: "Nomsa", lastName: "Mokoena", relationship: "mother", phone: "+27821234567", whatsapp: true, email: null },
      // A landline never has WhatsApp.
      { firstName: "Parent", lastName: "Mokoena", relationship: "father", phone: "+27115550000", whatsapp: false, email: "sipho@example.com" },
    ]);
  });

  it("reports rows that can't be imported, with spreadsheet line numbers", () => {
    expect(result.rows[1]).toMatchObject({ line: 3, learner: null, errors: ["Surname is missing"] });
    expect(result.rows[3].errors[0]).toContain("also on row 2");
  });

  it("imports rows with fixable problems and warns about them", () => {
    const sipho = result.rows[2];
    expect(sipho.learner?.dateOfBirth).toBeNull();
    expect(sipho.learner?.parents[0].phone).toBe("+27830001111");
    expect(sipho.warnings.some((w) => w.includes("Date of birth"))).toBe(true);
    expect(sipho.warnings.some((w) => w.includes("email"))).toBe(true);
  });

  it("asks for the required columns", () => {
    expect(parseLearnerImport("Class,Adm\n8A,1").missingColumns).toEqual(["first name", "surname"]);
  });
});

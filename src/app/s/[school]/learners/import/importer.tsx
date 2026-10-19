"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Section } from "@/components/ui";
import type { ImportSummary } from "@/server/import-learners";
import { importLearners, previewImport, type ImportPreview } from "./actions";

export function Importer({ slug }: { slug: string }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function choose(file: File | undefined) {
    setPreview(null);
    setSummary(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    const content = await file.text();
    setText(content);
    start(async () => {
      const result = await previewImport(slug, content);
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
  }

  function confirm() {
    if (!text) return;
    start(async () => {
      const result = await importLearners(slug, text);
      if (result.ok) {
        setSummary(result.data);
        setPreview(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Section title="2. Upload and check">
      <input
        type="file"
        accept=".csv,text/csv"
        className="block text-sm"
        disabled={pending}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {pending ? <p className="mt-3 text-sm text-slate-600">Working…</p> : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-4 text-sm">
          {preview.missingColumns.length ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-800">
              {fileName} has no column for: <strong>{preview.missingColumns.join(", ")}</strong>. Rename the column in
              the spreadsheet (or use the template) and upload again.
            </p>
          ) : (
            <>
              <p>
                <strong>{preview.valid}</strong> of {preview.total} rows can be imported
                {preview.existing ? `, ${preview.existing} of them already on file (will be updated)` : ""}, with{" "}
                {preview.parents} parents.
                {preview.invalid ? (
                  <span className="text-red-800">
                    {" "}
                    {preview.invalid} {preview.invalid === 1 ? "row" : "rows"} will be skipped.
                  </span>
                ) : null}
              </p>
              {preview.withoutAdmissionNumber ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                  {preview.withoutAdmissionNumber} learners have no admission number. Importing this file twice would
                  add them twice.
                </p>
              ) : null}
              {preview.unknownClasses.length ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                  These classes don&apos;t exist this year, so those learners won&apos;t be put in a class:{" "}
                  <strong>{preview.unknownClasses.join(", ")}</strong>.{" "}
                  <Link href={`/s/${slug}/classes/new`} className="link">
                    Add classes first
                  </Link>{" "}
                  if you want them placed.
                </p>
              ) : null}
              {preview.ignoredColumns.length ? (
                <p className="text-slate-600">Columns not used: {preview.ignoredColumns.join(", ")}.</p>
              ) : null}
            </>
          )}

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Learner</th>
                  <th>Class</th>
                  <th>Parents</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.className ?? "—"}</td>
                    <td>{r.parents}</td>
                    <td>
                      {r.errors.map((e) => (
                        <p key={e} className="text-red-800">
                          {e}
                        </p>
                      ))}
                      {r.warnings.map((w) => (
                        <p key={w} className="text-amber-800">
                          {w}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!preview.missingColumns.length && preview.valid > 0 ? (
            <button className="btn-primary" disabled={pending} onClick={confirm}>
              Import {preview.valid} learners
            </button>
          ) : null}
        </div>
      ) : null}

      {summary ? (
        <div role="status" className="mt-4 space-y-2 rounded-md bg-green-50 px-3 py-3 text-sm text-green-900">
          <p className="font-medium">Import finished.</p>
          <p>
            {summary.learnersCreated} learners added, {summary.learnersUpdated} updated, {summary.classesAssigned} placed
            in a class. {summary.parentsCreated} parents added, {summary.parentsReused} already on file.
            {summary.skipped ? ` ${summary.skipped} ${summary.skipped === 1 ? "row" : "rows"} skipped.` : ""}
          </p>
          {summary.notes.length ? (
            <ul className="list-disc pl-5 text-amber-900">
              {summary.notes.slice(0, 20).map((n) => (
                <li key={`${n.line}-${n.message}`}>
                  Row {n.line}: {n.message}
                </li>
              ))}
            </ul>
          ) : null}
          <Link href={`/s/${slug}/learners`} className="link">
            Go to learners
          </Link>
        </div>
      ) : null}
    </Section>
  );
}

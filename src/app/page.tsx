import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">SchoolOS</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Everything your school runs on, in one place.</h1>
      <p className="mt-4 text-lg text-slate-600">
        Learners and their families, textbooks, parent meetings, incidents, trips and maintenance, with a full
        record of who changed what. Built for old laptops and slow connections.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/sign-in" className="btn-primary">
          Sign in
        </Link>
        <Link href="/portal" className="btn-secondary">
          Parent portal
        </Link>
      </div>
    </main>
  );
}

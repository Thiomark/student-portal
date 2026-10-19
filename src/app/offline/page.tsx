export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 text-slate-600">
        This page hasn&apos;t been saved on this device yet. Pages you&apos;ve opened before, like the
        textbook desk, still work. Anything you record offline is sent when the connection comes back.
      </p>
    </main>
  );
}

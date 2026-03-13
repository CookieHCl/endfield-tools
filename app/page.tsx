import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">endfield-tools</h1>
          <p className="text-sm text-zinc-600">
            여러 도구 페이지로 이동하는 간단한 홈입니다.
          </p>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">페이지 목록</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/weapons"
                className="text-emerald-700 underline-offset-2 hover:underline"
              >
                보유 무기 관리 (/weapons)
              </Link>
            </li>
            <li>
              <Link
                href="/dungeon-farm"
                className="text-emerald-700 underline-offset-2 hover:underline"
              >
                기질 파밍 장소 (/dungeon-farm)
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

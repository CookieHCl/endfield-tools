"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/dungeon-farm", label: "기질 파밍 장소" },
    { href: "/weapons", label: "보유 무기 관리" },
    { href: "/recruitment", label: "공개모집 계산기" },
  ];

  return (
    <nav className="border-b border-zinc-200 bg-white shadow-sm sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-6 lg:px-8">
        <Link href="/dungeon-farm" className="text-xl font-bold tracking-tight text-zinc-900">
          Endfield Tools
        </Link>
        {/* 좁은 화면에서는 브랜드 아래 줄로 내려가고, 넘치면 가로 스크롤 */}
        <div className="flex max-w-full gap-1 overflow-x-auto bg-zinc-100 p-1 rounded-lg self-start md:self-auto">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap px-3 md:px-4 py-1.5 text-sm font-medium transition-all rounded-md ${isActive
                    ? "bg-white text-zinc-950 shadow-sm ring-1 ring-black/5"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50"
                  }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

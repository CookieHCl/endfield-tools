"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/dungeon-farm", label: "기질 파밍 장소" },
    { href: "/weapons", label: "보유 무기 관리" },
  ];

  return (
    <nav className="border-b border-zinc-200 bg-white shadow-sm sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/dungeon-farm" className="text-xl font-bold tracking-tight text-zinc-900">
            Endfield Tools
          </Link>
          <div className="hidden md:flex gap-1 bg-zinc-100 p-1 rounded-lg">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-1.5 text-sm font-medium transition-all rounded-md ${isActive
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

        {/* Mobile Navigation fallback (simple links for now if screen is small) */}
        <div className="flex md:hidden gap-4 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "text-zinc-900 underline underline-offset-4" : "text-zinc-500"}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

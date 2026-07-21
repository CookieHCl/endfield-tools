"use client";

import { downloadAllData, importAllData } from "@/lib/app-data";

// 어느 페이지에 놓든 세 데이터(보유무기·공장·공개모집) 전체를 내보내기/불러오기 한다.
// 불러오기 성공 시 페이지를 새로고침해 모든 화면이 새 데이터로 동기화되게 한다.
export function ImportExportButtons({ className = "" }: { className?: string }) {
  const handleImport = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importAllData(String(reader.result));
      if (ok) {
        window.location.reload();
      } else {
        window.alert("불러올 수 없는 파일입니다.");
      }
    };
    reader.readAsText(file);
  };

  const btn =
    "whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100";

  return (
    <div className={"flex gap-2 " + className}>
      <button type="button" onClick={downloadAllData} className={btn}>
        JSON 내보내기
      </button>
      <label className={"inline-flex cursor-pointer items-center " + btn}>
        JSON 불러오기
        <input
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => handleImport(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}

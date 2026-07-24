"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RECIPES,
  RECIPE_BY_ID,
  ITEMS,
  itemName,
} from "@/data/factory-db";
import { FactoryIcon } from "@/components/factory-icon";
import { ImportExportButtons } from "@/components/import-export-buttons";
import { uid } from "@/lib/factory";
import {
  loadProcesses,
  saveProcesses,
  processToRecipe,
  type Process,
  type ProcessLine,
} from "@/lib/process";
import {
  NumInput,
  ItemPicker,
  RecipeFormula,
  RecipeIOFields,
  RecipePicker,
  Section,
  addBtn,
  delBtn,
} from "@/components/factory-ui";

const DEFAULT_ICON = ITEMS[0].id;

export default function ProcessPage() {
  const [processes, setProcesses] = useState<Process[]>([]);

  // 편집 중인 공정(초안). editingId가 있으면 기존 공정 수정, 없으면 새로 만들기.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [iconChosen, setIconChosen] = useState(false);
  const [lines, setLines] = useState<ProcessLine[]>([]);

  // 레시피 추가 패널의 "자원으로 필터" 값. 입출력 아이콘 클릭으로도 세팅된다.
  const [filterItemId, setFilterItemId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // 자원 아이콘 클릭 → 그 자원으로 필터하고 추가 패널로 스크롤.
  const pickFilterItem = (itemId: string) => {
    setFilterItemId(itemId);
    pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProcesses(loadProcesses());
  }, []);

  // 목록 변경은 즉시 저장 (초기 로드 전에 빈 배열로 덮어쓰지 않도록 effect가 아닌 여기서만 저장)
  const commit = (next: Process[]) => {
    setProcesses(next);
    saveProcesses(next);
  };

  const clearDraft = () => {
    setEditingId(null);
    setName("");
    setIcon(DEFAULT_ICON);
    setIconChosen(false);
    setLines([]);
  };

  const addLine = (recipeId: string) =>
    setLines((prev) => {
      // 첫 레시피를 넣을 때 아이콘을 직접 고르지 않았다면 그 레시피 아이콘을 기본값으로.
      if (prev.length === 0 && !iconChosen) {
        const r = RECIPE_BY_ID.get(recipeId);
        if (r) setIcon(r.icon);
      }
      return [...prev, { id: uid(), recipeId, count: 1 }];
    });

  const patchLine = (id: string, patch: Partial<ProcessLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  // 초안을 공정으로 변환 (요약·미리보기용)
  const draftProcess = useMemo<Process>(
    () => ({ id: editingId ?? "draft", name, icon, lines }),
    [editingId, name, icon, lines],
  );
  const draftRecipe = useMemo(
    () => processToRecipe(draftProcess),
    [draftProcess],
  );
  const hasIO =
    Object.keys(draftRecipe.in ?? {}).length > 0 ||
    Object.keys(draftRecipe.out ?? {}).length > 0;

  const saveDraft = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      window.alert("공정 이름을 입력하세요.");
      return;
    }
    if (lines.length === 0) {
      window.alert("레시피를 하나 이상 추가하세요.");
      return;
    }
    const id = editingId ?? uid();
    const proc: Process = { id, name: trimmed, icon, lines };
    const next = editingId
      ? processes.map((p) => (p.id === id ? proc : p))
      : [...processes, proc];
    commit(next);
    clearDraft();
  };

  const editProcess = (p: Process) => {
    setEditingId(p.id);
    setName(p.name);
    setIcon(p.icon);
    setIconChosen(true);
    setLines(p.lines.map((l) => ({ ...l })));
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteProcess = (id: string) => {
    const p = processes.find((x) => x.id === id);
    if (!window.confirm(`공정 "${p?.name ?? ""}"을(를) 삭제할까요?`)) return;
    commit(processes.filter((x) => x.id !== id));
    if (editingId === id) clearDraft();
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">공정 관리</h1>
            <p className="text-sm text-zinc-600">
              여러 레시피를 하나로 묶어 새 공정을 만듭니다. 저장한 공정은 공장
              계산기에서 레시피처럼 배치할 수 있습니다 (아이콘에 파란 테두리로
              구분).
            </p>
            <p className="text-xs text-zinc-500">
              브라우저에 자동 저장 · 기존 레시피만 사용 가능 · 저장된 공정{" "}
              {processes.length}개
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ImportExportButtons />
          </div>
        </header>

        {/* 공정 만들기 / 편집 ------------------------------------------- */}
        <Section
          title={editingId ? "공정 편집" : "새 공정 만들기"}
          hint={`${lines.length}개 레시피`}
          right={
            editingId ? (
              <button
                type="button"
                onClick={clearDraft}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
              >
                편집 취소
              </button>
            ) : undefined
          }
        >
          {/* 이름 · 아이콘 */}
          <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-zinc-500">
                이름
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="공정 이름…"
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-zinc-500">
                아이콘 (자원에서 선택)
              </span>
              {/* 아이콘은 설비·벨트까지 전부 고를 수 있어야 하므로 ITEMS 전체를 넘긴다. */}
              <ItemPicker
                value={icon}
                clearable={false}
                items={ITEMS}
                placeholder="아이콘으로 쓸 자원 검색…"
                onSelect={(id) => {
                  if (id) {
                    setIcon(id);
                    setIconChosen(true);
                  }
                }}
              />
            </label>
          </div>

          {/* 이 공정의 입출력 요약 (인풋 → 아웃풋, 순생산 0 제외) */}
          <div className="border-b border-zinc-200 bg-blue-50/40 px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <FactoryIcon id={icon} size={24} ring />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                이 공정의 입출력
              </span>
              <span className="text-[11px] font-normal normal-case text-zinc-400">
                분당 · 순생산 0인 자원 제외
              </span>
            </div>
            {hasIO ? (
              <RecipeFormula recipe={draftRecipe} iconSize={28} showTime={false} />
            ) : (
              <p className="text-sm text-zinc-400">
                아래에서 레시피를 추가하면 합산된 입출력이 여기에 표시됩니다.
              </p>
            )}
          </div>

          {/* 레시피 추가 패널 (기존 레시피만) */}
          <div ref={pickerRef}>
            <RecipePicker
              recipes={RECIPES}
              onAdd={addLine}
              filterItemId={filterItemId}
              onFilterItemId={setFilterItemId}
            />
          </div>

          {/* 추가된 레시피 목록 */}
          {lines.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              위에서 레시피를 추가해 공정을 구성하세요.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {lines.map((line) => {
                const recipe = RECIPE_BY_ID.get(line.recipeId);
                if (!recipe) return null;
                return (
                  <div key={line.id} className="flex flex-col gap-3 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <FactoryIcon id={recipe.icon} size={32} />
                      <div className="min-w-0 max-w-56">
                        <div className="truncate text-sm font-semibold text-zinc-800">
                          {recipe.name}
                        </div>
                        {recipe.producers && recipe.producers.length > 0 && (
                          <div className="truncate text-xs text-zinc-400">
                            {recipe.producers.map(itemName).join(", ")}
                          </div>
                        )}
                      </div>
                      <RecipeFormula recipe={recipe} />
                      <div className="ml-auto flex items-center gap-2">
                        <label className="flex items-center gap-1.5">
                          <span className="text-xs text-zinc-500">수량</span>
                          <div className="w-24">
                            <NumInput
                              value={line.count}
                              onChange={(n) => patchLine(line.id, { count: n })}
                              allowNegative={false}
                            />
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className={delBtn}
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* 입력 → 출력 (분당 소비/산출) */}
                    <RecipeIOFields
                      recipe={recipe}
                      count={line.count}
                      onCount={(n) => patchLine(line.id, { count: n })}
                      onPickItem={pickFilterItem}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* 저장 */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/70 px-5 py-3">
            {editingId && (
              <button
                type="button"
                onClick={clearDraft}
                className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-full border border-amber-400 bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
            >
              {editingId ? "공정 수정 저장" : "공정 저장"}
            </button>
          </div>
        </Section>

        {/* 저장된 공정 -------------------------------------------------- */}
        <Section title="저장된 공정" hint={`${processes.length}개`}>
          {processes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              아직 저장된 공정이 없습니다. 위에서 새 공정을 만들어 저장하세요.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {processes.map((p) => {
                const recipe = processToRecipe(p);
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
                  >
                    <FactoryIcon id={p.icon} size={32} ring />
                    <div className="min-w-0 max-w-56">
                      <div className="truncate text-sm font-semibold text-zinc-800">
                        {p.name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {p.lines.length}개 레시피
                      </div>
                    </div>
                    <RecipeFormula recipe={recipe} showTime={false} />
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editProcess(p)}
                        className={addBtn}
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProcess(p.id)}
                        className={delBtn}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}

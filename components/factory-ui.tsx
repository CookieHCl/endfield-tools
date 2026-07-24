"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ITEMS, itemName, type FactoryRecipe } from "@/data/factory-db";
import { FactoryIcon } from "@/components/factory-icon";
import { formatNumber } from "@/lib/factory";
import { isProcessRecipeId } from "@/lib/process";

// 공장/공정 페이지가 공유하는 UI 조각들.

export const addBtn =
  "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100";
export const delBtn =
  "shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600";

/// 숫자 입력 (연동 필드) --------------------------------------------------
// value는 외부 상태에서 내려오고, 포커스 중에는 로컬 문자열을 유지해 자유 입력을 허용한다.
// 유효한 숫자가 입력되면 즉시 onChange → 형제 필드들이 같이 갱신된다.
export function NumInput({
  value,
  onChange,
  disabled,
  allowNegative = true,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  allowNegative?: boolean;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const display = text ?? formatNumber(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={display}
      onFocus={() => setText(formatNumber(value))}
      onBlur={() => setText(null)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") return;
        const n = Number(t);
        if (!Number.isFinite(n)) return;
        if (!allowNegative && n < 0) return;
        onChange(n);
      }}
      className={
        "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 " +
        className
      }
    />
  );
}

/// 레시피 요약(입력 → 출력) 미리보기 -------------------------------------
// 공정 레시피는 시간 개념이 없으므로 시간 배지를 숨긴다.
export function RecipeFormula({
  recipe,
  iconSize = 18,
  showTime,
}: {
  recipe: FactoryRecipe;
  iconSize?: number;
  showTime?: boolean;
}) {
  const ins = Object.entries(recipe.in ?? {});
  const outs = Object.entries(recipe.out ?? {});
  const withTime = showTime ?? !isProcessRecipeId(recipe.id);
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
      {ins.length === 0 ? (
        <span className="text-zinc-400">원자재</span>
      ) : (
        ins.map(([id, qty]) => (
          <span
            key={id}
            className="inline-flex items-center gap-0.5"
            title={itemName(id)}
          >
            <FactoryIcon id={id} size={iconSize} />
            <span className="tabular-nums">{formatNumber(qty)}</span>
          </span>
        ))
      )}
      <span className="px-0.5 text-zinc-400">→</span>
      {outs.length === 0 ? (
        <span className="text-zinc-400">소비</span>
      ) : (
        outs.map(([id, qty]) => (
          <span
            key={id}
            className="inline-flex items-center gap-0.5"
            title={itemName(id)}
          >
            <FactoryIcon id={id} size={iconSize} />
            <span className="tabular-nums">{formatNumber(qty)}</span>
          </span>
        ))
      )}
      {withTime && (
        <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-400">
          {recipe.time}s
        </span>
      )}
    </div>
  );
}

/// 배치된 레시피의 입출력 자원 한 칸 (큰 아이콘 · 이름 · 분당 수량 입력) ----
// 세로 카드 형태라 자원이 많아도 그리드로 깔끔하게 줄바꿈된다.
export function ResourceField({
  itemId,
  ratePerMin,
  onRate,
  titleSuffix,
  onPick,
}: {
  itemId: string;
  ratePerMin: number;
  onRate: (n: number) => void;
  titleSuffix: string;
  // 있으면 아이콘이 클릭 가능해지고, 누르면 이 자원으로 필터하도록 콜백한다.
  onPick?: (itemId: string) => void;
}) {
  return (
    <div
      className="flex w-28 flex-col items-center gap-1 text-center"
      title={`${itemName(itemId)} ${titleSuffix}`}
    >
      {onPick ? (
        <button
          type="button"
          onClick={() => onPick(itemId)}
          title={`${itemName(itemId)} · 클릭해서 자원으로 필터`}
          className="rounded-md transition-colors hover:bg-amber-100"
        >
          <FactoryIcon id={itemId} size={40} />
        </button>
      ) : (
        <FactoryIcon id={itemId} size={40} />
      )}
      {/* 이름 영역 높이를 2줄로 고정 → 이름 길이와 무관하게 카드 높이가 일정하다.
          2줄을 넘으면 …으로 자르고, 전체 이름은 카드 hover 툴팁으로 확인. */}
      <div className="flex h-8 items-center">
        <span className="line-clamp-2 text-xs leading-tight text-zinc-600">
          {itemName(itemId)}
        </span>
      </div>
      <div className="w-full">
        <NumInput value={ratePerMin} onChange={onRate} allowNegative={false} />
      </div>
    </div>
  );
}

/// 레시피의 입력 → 출력 (분당 소비/산출) 편집 그리드 --------------------
// 각 자원 필드는 분당 수량을 편집하고 count(수량 배수)를 역산해 갱신한다.
export function RecipeIOFields({
  recipe,
  count,
  onCount,
  onPickItem,
}: {
  recipe: FactoryRecipe;
  count: number;
  onCount: (n: number) => void;
  // 있으면 각 자원 아이콘을 클릭해 그 자원으로 필터할 수 있다.
  onPickItem?: (itemId: string) => void;
}) {
  const ins = Object.entries(recipe.in ?? {});
  const outs = Object.entries(recipe.out ?? {});
  return (
    <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      {/* 입력 (분당 소비) */}
      {ins.length === 0 ? (
        <span className="text-xs text-zinc-400">원자재</span>
      ) : (
        ins.map(([item, qty]) => {
          const base = (qty * 60) / recipe.time;
          return (
            <ResourceField
              key={"in-" + item}
              itemId={item}
              ratePerMin={count * base}
              onRate={(n) => onCount(n / base)}
              titleSuffix="분당 소비"
              onPick={onPickItem}
            />
          );
        })
      )}

      <span className="px-1 text-lg text-zinc-400">→</span>

      {/* 출력 (분당 산출) */}
      {outs.length === 0 ? (
        <span className="text-xs text-zinc-400">소비</span>
      ) : (
        outs.map(([item, qty]) => {
          const base = (qty * 60) / recipe.time;
          return (
            <ResourceField
              key={"out-" + item}
              itemId={item}
              ratePerMin={count * base}
              onRate={(n) => onCount(n / base)}
              titleSuffix="분당 산출"
              onPick={onPickItem}
            />
          );
        })
      )}
    </div>
  );
}

/// 자원 선택 콤보박스 --------------------------------------------------
// 이름 검색: 검색어 입력 → 이름 리스트에서 선택.
// 아이콘 검색: 검색어가 비면 전체 자원 아이콘 그리드를 보여줘 아이콘만 보고 선택.
// 드롭다운은 섹션의 overflow-hidden에 잘리지 않도록 portal로 body에 띄운다.
export function ItemPicker({
  value,
  onSelect,
  placeholder = "자원 이름 검색…",
  clearable = true,
}: {
  value: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // 드롭다운 위치를 앵커 기준으로 맞추고, 스크롤/리사이즈 시 따라가게 한다.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query ? ITEMS.filter((it) => it.name.toLowerCase().includes(query)) : ITEMS,
    [query],
  );

  const selected = value ? itemName(value) : "";

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={anchorRef} className="flex items-center gap-2">
      {value && <FactoryIcon id={value} size={24} />}
      <input
        type="text"
        value={open ? search : selected}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setSearch("");
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
      {value && clearable && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
        >
          해제
        </button>
      )}

      {open &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-xl"
            style={(() => {
              // 아래 공간이 부족하고 위가 더 넓으면 위쪽으로 펼친다.
              const spaceBelow = window.innerHeight - rect.bottom;
              const openUp = spaceBelow < 260 && rect.top > spaceBelow;
              const common = {
                left: rect.left,
                width: Math.max(rect.width, 240),
              } as const;
              return openUp
                ? {
                  ...common,
                  bottom: window.innerHeight - rect.top + 4,
                  maxHeight: Math.min(320, rect.top - 8),
                }
                : {
                  ...common,
                  top: rect.bottom + 4,
                  maxHeight: Math.min(320, spaceBelow - 8),
                };
            })()}
          >
            {matches.length === 0 ? (
              <div className="px-3 py-3 text-xs text-zinc-400">
                일치하는 자원 없음
              </div>
            ) : query ? (
              // 이름 검색 결과: 아이콘 + 이름 리스트
              <div className="flex flex-col py-1">
                {matches.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => choose(it.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-amber-50"
                  >
                    <FactoryIcon id={it.id} size={24} />
                    <span className="text-zinc-800">{it.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              // 아이콘 그리드: 이름 없이 아이콘만 보고 선택 (이름은 hover 툴팁)
              <div className="flex flex-wrap gap-1 p-2">
                {matches.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    title={it.name}
                    onClick={() => choose(it.id)}
                    className={
                      "rounded-md border p-1 transition-colors hover:bg-amber-50 " +
                      (it.id === value
                        ? "border-amber-500 bg-amber-50"
                        : "border-transparent")
                    }
                  >
                    <FactoryIcon id={it.id} size={40} />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/// 섹션 래퍼 -------------------------------------------------------------
export function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-5 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          {title}
          {hint && (
            <span className="ml-2 font-medium normal-case tracking-normal text-zinc-400">
              {hint}
            </span>
          )}
        </span>
        {right}
      </div>
      {children}
    </section>
  );
}

/// 레시피 추가 패널 (자원 필터 + 이름 검색 + 목록) ----------------------
// recipes로 넘어온 것만 후보로 쓴다. 공정 레시피는 아이콘에 파란 테두리를 씌운다.
export function RecipePicker({
  recipes,
  onAdd,
  filterItemId,
  onFilterItemId,
}: {
  recipes: FactoryRecipe[];
  onAdd: (recipeId: string) => void;
  // "자원으로 필터"는 부모가 제어한다 (아이콘 클릭으로도 세팅되도록).
  filterItemId: string | null;
  onFilterItemId: (id: string | null) => void;
}) {
  const [recipeSearch, setRecipeSearch] = useState("");
  // 자원 필터를 어디에서 찾을지 (기본은 입력·출력 둘 다)
  const [matchIn, setMatchIn] = useState(true);
  const [matchOut, setMatchOut] = useState(true);

  const filtered = useMemo(() => {
    // 입력·출력 둘 다 해제하면 아무것도 안 보여준다. (별도 예외처리 없음)
    if (!matchIn && !matchOut) return [];
    const q = recipeSearch.trim().toLowerCase();
    // 검색어·자원 필터가 모두 비었을 때, 정의된 공정이 있으면 그 공정만 먼저 보여준다.
    // (기본 레시피 수백 개에 묻히지 않도록 사용자가 만든 공정을 바로 노출)
    if (!q && !filterItemId) {
      const processRecipes = recipes.filter((r) => isProcessRecipeId(r.id));
      if (processRecipes.length > 0) return processRecipes;
    }
    return recipes.filter((r) => {
      if (filterItemId) {
        // 선택한 방향(입력/출력)에 이 자원이 있는 레시피만
        const involved =
          (matchIn && filterItemId in (r.in ?? {})) ||
          (matchOut && filterItemId in (r.out ?? {}));
        if (!involved) return false;
      }
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recipes, filterItemId, recipeSearch, matchIn, matchOut]);

  // 위 기본 상태(검색어·필터 없음)에서 공정만 보여주는 중인지
  const showingProcessesOnly =
    !recipeSearch.trim() &&
    !filterItemId &&
    filtered.length > 0 &&
    filtered.every((r) => isProcessRecipeId(r.id));

  return (
    <div className="border-b border-zinc-200 bg-amber-50/40 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <div className="mb-1 flex h-7 items-center justify-between gap-2">
            <label className="text-xs font-semibold text-zinc-500">
              자원으로 필터
            </label>
            {/* 자원이 입력/출력 어디에 있는 레시피를 찾을지 (입력|출력) */}
            <div className="inline-flex overflow-hidden rounded-md border border-zinc-300 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMatchIn((v) => !v)}
                title="입력에 이 자원이 있는 레시피"
                className={
                  "px-2.5 py-0.5 transition-colors " +
                  (matchIn
                    ? "bg-amber-500 text-white"
                    : "bg-white text-zinc-500 hover:bg-zinc-100")
                }
              >
                입력
              </button>
              <button
                type="button"
                onClick={() => setMatchOut((v) => !v)}
                title="출력에 이 자원이 있는 레시피"
                className={
                  "border-l border-zinc-300 px-2.5 py-0.75 transition-colors " +
                  (matchOut
                    ? "bg-amber-500 text-white"
                    : "bg-white text-zinc-500 hover:bg-zinc-100")
                }
              >
                출력
              </button>
            </div>
          </div>
          <ItemPicker
            value={filterItemId}
            onSelect={onFilterItemId}
            placeholder="자원 아이콘/이름으로 레시피 찾기…"
          />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex h-7 items-center">
            <label className="text-xs font-semibold text-zinc-500">
              레시피 이름 검색
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder="레시피 이름…"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            {recipeSearch && (
              <button
                type="button"
                onClick={() => setRecipeSearch("")}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
              >
                해제
              </button>
            )}
          </div>
        </div>
      </div>

      {showingProcessesOnly && (
        <p className="mt-2 text-xs text-zinc-400">
          정의한 공정 {filtered.length}개를 보여줍니다. 기본 레시피는 이름을
          검색하거나 자원으로 필터하세요.
        </p>
      )}

      <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-400">
            조건에 맞는 레시피가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.map((recipe) => (
              <li
                key={recipe.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-amber-50/60"
              >
                <FactoryIcon
                  id={recipe.icon}
                  size={28}
                  ring={isProcessRecipeId(recipe.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-800">
                    {recipe.name}
                  </div>
                  <RecipeFormula recipe={recipe} />
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(recipe.id)}
                  className={addBtn}
                >
                  + 추가
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

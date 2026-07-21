"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ITEMS,
  RECIPES,
  RECIPE_BY_ID,
  itemName,
  type FactoryRecipe,
} from "@/data/factory-db";
import { FactoryIcon } from "@/components/factory-icon";
import { ImportExportButtons } from "@/components/import-export-buttons";
import { cleanNumber, formatNumber } from "@/lib/factory";

/// 타입 -----------------------------------------------------------------

type FactoryNum = 1 | 2 | 3 | 4;
const FACTORIES: FactoryNum[] = [1, 2, 3, 4];

// 입력이 귀속되는 대상: "all"이면 공장 전체(총합에만), 숫자면 해당 공장 열에만.
type InputTarget = FactoryNum | "all";

// 공짜로 들어오는 자원. infinite면 rate는 무시하고 무한 공급으로 취급.
interface InputRow {
  id: string;
  itemId: string;
  rate: number;
  infinite: boolean;
  target: InputTarget;
}

// 공장에 배치한 레시피 한 줄. count는 실행 배수(소수 가능), 나머지 필드는 전부 파생.
interface RecipeLine {
  id: string;
  recipeId: string;
  count: number;
  factory: FactoryNum;
}

// 개당 관리권으로 교환되는 자원.
interface VoucherRow {
  id: string;
  itemId: string;
  perUnit: number;
}

interface FactoryState {
  inputs: InputRow[];
  lines: RecipeLine[];
  vouchers: VoucherRow[];
  targetPerMin: number;
}

// 결산 셀: 무한 공급 여부 + 유한 순량(공장 열은 로컬 수지, 전체 열은 공유풀 순수지).
// idle = 그 공장에만 남아 다른 공장은 못 쓰는 유휴량 (공장 열 전용).
interface Cell {
  inf: boolean;
  delta: number;
  idle?: number;
}

/// 헬퍼 -----------------------------------------------------------------

const STORAGE_KEY = "factoryCalculator";

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 표에서 총합 정렬 버킷: 음수(0) < 양수(1) < ∞음수(2) < ∞양수(3) < 0(4) < ∞0(5)
function bucket(cell: Cell): number {
  const d = cleanNumber(cell.delta);
  if (!cell.inf) return d < 0 ? 0 : d > 0 ? 1 : 4;
  return d < 0 ? 2 : d > 0 ? 3 : 5;
}

function cellText(cell: Cell): string {
  const d = cleanNumber(cell.delta);
  if (!cell.inf) return formatNumber(d);
  if (d === 0) return "∞ + 0";
  return d > 0 ? `∞ + ${formatNumber(d)}` : `∞ - ${formatNumber(-d)}`;
}

function cellClass(cell: Cell): string {
  if (cell.inf) return "text-zinc-400";
  const d = cleanNumber(cell.delta);
  if (d < 0) return "text-red-600";
  if (d > 0) return "text-blue-600";
  return "text-zinc-400";
}

/// 숫자 입력 (연동 필드) --------------------------------------------------
// value는 외부 상태에서 내려오고, 포커스 중에는 로컬 문자열을 유지해 자유 입력을 허용한다.
// 유효한 숫자가 입력되면 즉시 onChange → 형제 필드들이 같이 갱신된다.
function NumInput({
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
function RecipeFormula({ recipe }: { recipe: FactoryRecipe }) {
  const ins = Object.entries(recipe.in ?? {});
  const outs = Object.entries(recipe.out ?? {});
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
      {ins.length === 0 ? (
        <span className="text-zinc-400">원자재</span>
      ) : (
        ins.map(([id, qty]) => (
          <span key={id} className="inline-flex items-center gap-0.5" title={itemName(id)}>
            <FactoryIcon id={id} size={18} />
            <span className="tabular-nums">{qty}</span>
          </span>
        ))
      )}
      <span className="px-0.5 text-zinc-400">→</span>
      {outs.length === 0 ? (
        <span className="text-zinc-400">소비</span>
      ) : (
        outs.map(([id, qty]) => (
          <span key={id} className="inline-flex items-center gap-0.5" title={itemName(id)}>
            <FactoryIcon id={id} size={18} />
            <span className="tabular-nums">{qty}</span>
          </span>
        ))
      )}
      <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-400">
        {recipe.time}s
      </span>
    </div>
  );
}

/// 자원 선택 콤보박스 --------------------------------------------------
// 이름 검색: 검색어 입력 → 이름 리스트에서 선택.
// 아이콘 검색: 검색어가 비면 전체 자원 아이콘 그리드를 보여줘 아이콘만 보고 선택.
// 드롭다운은 섹션의 overflow-hidden에 잘리지 않도록 portal로 body에 띄운다.
function ItemPicker({
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
function Section({
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

const addBtn =
  "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100";
const delBtn =
  "shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600";

/// 페이지 ---------------------------------------------------------------

export default function FactoryPage() {
  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [targetPerMin, setTargetPerMin] = useState(0);

  // 레시피 추가 패널 상태
  const [filterItemId, setFilterItemId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");

  // 불러오기
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<FactoryState>;
        if (Array.isArray(parsed.inputs)) {
          setInputs(parsed.inputs);
        }
        if (Array.isArray(parsed.lines)) {
          setLines(parsed.lines);
        }
        if (Array.isArray(parsed.vouchers)) {
          setVouchers(parsed.vouchers);
        }
        if (typeof parsed.targetPerMin === "number") {
          setTargetPerMin(parsed.targetPerMin);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // 저장 (불러오기 effect가 먼저 실행돼 상태를 채운 뒤 값 기준으로 다시 저장됨)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const state: FactoryState = { inputs, lines, vouchers, targetPerMin };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }, [inputs, lines, vouchers, targetPerMin]);

  /// 결산 계산 ----------------------------------------------------------
  const summary = useMemo(() => {
    const add = (map: Map<string, number>, key: string, v: number) =>
      map.set(key, (map.get(key) ?? 0) + v);
    const maps4 = (): Map<string, number>[] => [
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    ];

    // 공장별 레시피 생산량/소비량 (분당). 생산물은 공유풀로 흐른다.
    const prodByF = maps4();
    const consByF = maps4();
    for (const line of lines) {
      const recipe = RECIPE_BY_ID.get(line.recipeId);
      if (!recipe) continue;
      const per = (60 / recipe.time) * line.count;
      for (const [item, qty] of Object.entries(recipe.out ?? {}))
        add(prodByF[line.factory - 1], item, qty * per);
      for (const [item, qty] of Object.entries(recipe.in ?? {}))
        add(consByF[line.factory - 1], item, qty * per);
    }

    // 입력: 배치(공장 전용)는 그 공장 부족분만 메우고 남으면 유휴. 전체는 공유풀에만.
    const exclByF = maps4();
    const exclInfByF: Set<string>[] = [
      new Set(),
      new Set(),
      new Set(),
      new Set(),
    ];
    const allDelta = new Map<string, number>();
    const allInf = new Set<string>();
    for (const inp of inputs) {
      const target: InputTarget =
        inp.target === 1 || inp.target === 2 || inp.target === 3 || inp.target === 4
          ? inp.target
          : "all";
      if (target === "all") {
        if (inp.infinite) allInf.add(inp.itemId);
        else add(allDelta, inp.itemId, inp.rate);
      } else if (inp.infinite) {
        exclInfByF[target - 1].add(inp.itemId);
      } else {
        add(exclByF[target - 1], inp.itemId, inp.rate);
      }
    }

    // 결산 대상 = 입력으로 지정했거나 레시피 입출력에 쓰인 자원만
    const resourceIds = new Set<string>();
    inputs.forEach((i) => resourceIds.add(i.itemId));
    for (const line of lines) {
      const recipe = RECIPE_BY_ID.get(line.recipeId);
      if (!recipe) continue;
      Object.keys(recipe.out ?? {}).forEach((k) => resourceIds.add(k));
      Object.keys(recipe.in ?? {}).forEach((k) => resourceIds.add(k));
    }

    const totalById = new Map<string, Cell>();
    const rows = Array.from(resourceIds, (item) => {
      let contributionSum = 0; // 각 공장이 공유풀에 실제로 기여하는 유한량 합
      const factories: Cell[] = FACTORIES.map((f) => {
        const prod = prodByF[f - 1].get(item) ?? 0;
        const cons = consByF[f - 1].get(item) ?? 0;
        const excl = exclByF[f - 1].get(item) ?? 0;
        const exclInf = exclInfByF[f - 1].has(item);
        const net = prod - cons; // 레시피 순생산 (이동 가능)
        const shortfall = Math.max(0, cons - prod); // 자체 생산으로 못 메우는 소비
        const localBalance = net + excl; // 공장 열에 보이는 값

        let usedExcl: number; // 실제로 그 공장 소비를 메운 배치입력
        let idle: number; // 못 쓰고 남은 배치입력 (유휴)
        if (exclInf) {
          usedExcl = shortfall; // 무한 배치입력은 부족분을 전부 메움
          idle = Infinity; // 남는 무한 공급 (배지 표기 안 함)
        } else if (excl > 0) {
          usedExcl = Math.min(excl, shortfall);
          idle = excl - usedExcl;
        } else {
          usedExcl = excl; // 음수 = 드레인, 전량 반영
          idle = 0;
        }
        contributionSum += net + usedExcl; // 공유풀 기여분 (유한)
        return { inf: exclInf, delta: localBalance, idle };
      });

      // 전체 합 = 전체입력 + 공유풀 기여분 합. 배치된 무한 공급은 갇히므로 총합을 무한으로 만들지 않는다.
      const delta = (allDelta.get(item) ?? 0) + contributionSum;
      const total: Cell = { inf: allInf.has(item), delta };
      totalById.set(item, total);
      return { itemId: item, name: itemName(item), total, factories };
    });

    rows.sort((a, b) => {
      const ka = [bucket(a.total), ...a.factories.map(bucket)];
      const kb = [bucket(b.total), ...b.factories.map(bucket)];
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return a.name.localeCompare(b.name, "en");
    });

    // 관리권 생산량 = Σ (자원 총생산량 × 개당 관리권)
    let voucherPerMin = 0;
    let voucherInf = false;
    for (const v of vouchers) {
      const total = totalById.get(v.itemId) ?? { inf: false, delta: 0 };
      if (total.inf) voucherInf = true;
      voucherPerMin += total.delta * v.perUnit;
    }

    return { rows, voucherPerMin, voucherInf };
  }, [inputs, lines, vouchers]);

  /// 레시피 추가 패널 ---------------------------------------------------
  const filteredRecipes = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    return RECIPES.filter((r) => {
      if (filterItemId) {
        const involved =
          filterItemId in (r.in ?? {}) || filterItemId in (r.out ?? {});
        if (!involved) return false;
      }
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filterItemId, recipeSearch]);

  /// 액션 --------------------------------------------------------------
  const addInput = () =>
    setInputs((prev) => [
      ...prev,
      { id: uid(), itemId: ITEMS[0].id, rate: 0, infinite: false, target: "all" },
    ]);
  const addLine = (recipeId: string) =>
    setLines((prev) => [
      ...prev,
      { id: uid(), recipeId, count: 1, factory: 1 },
    ]);
  const addVoucher = () =>
    setVouchers((prev) => [
      ...prev,
      { id: uid(), itemId: ITEMS[0].id, perUnit: 1 },
    ]);

  const patchInput = (id: string, patch: Partial<InputRow>) =>
    setInputs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchLine = (id: string, patch: Partial<RecipeLine>) =>
    setLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchVoucher = (id: string, patch: Partial<VoucherRow>) =>
    setVouchers((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );

  const resetAll = () => {
    if (!window.confirm("공장 계산기의 모든 입력을 초기화할까요?")) return;
    setInputs([]);
    setLines([]);
    setVouchers([]);
    setTargetPerMin(0);
  };

  const voucherText = summary.voucherInf ? "∞" : formatNumber(summary.voucherPerMin);
  const voucherHourText = summary.voucherInf
    ? "∞"
    : formatNumber(summary.voucherPerMin * 60);

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">공장 계산기</h1>
            <p className="text-sm text-zinc-600">
              들어오는 자원과 레시피를 배치해 공장별 분당 수지를 계산합니다. 레시피
              데이터는{" "}
              <a
                href="https://github.com/endfield-calc/factoriolab/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-zinc-900"
              >
                endfield-calc/factoriolab
              </a>
              에서 가져옵니다.
            </p>
            <p className="text-xs text-zinc-500">
              브라우저에 자동 저장 · 자원 {ITEMS.length}종 · 레시피 {RECIPES.length}종
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ImportExportButtons />
            <button
              type="button"
              onClick={resetAll}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
            >
              공장만 초기화
            </button>
          </div>
        </header>

        {/* 1. 공장 입력 -------------------------------------------------- */}
        <Section
          title="공장 입력"
          hint="공짜로 들어오는 자원"
          right={
            <button type="button" onClick={addInput} className={addBtn}>
              + 자원 추가
            </button>
          }
        >
          {inputs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              외부에서 무료로 공급되는 자원을 추가하세요. 수량을 음수로 두면 계속
              소비되는 자원, &quot;무한&quot;은 무제한 공급을 의미합니다.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {inputs.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-56 flex-1">
                    <ItemPicker
                      value={row.itemId}
                      clearable={false}
                      onSelect={(id) =>
                        id && patchInput(row.id, { itemId: id })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                    <span className="text-xs text-zinc-500">분당</span>
                    <div className="w-28">
                      <NumInput
                        value={row.rate}
                        onChange={(n) => patchInput(row.id, { rate: n })}
                        disabled={row.infinite}
                      />
                    </div>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500">배치</span>
                    <div className="flex gap-1">
                      {(["all", 1, 2, 3, 4] as const).map((t) => {
                        const active = (row.target ?? "all") === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patchInput(row.id, { target: t })}
                            title={t === "all" ? "공장 전체" : `공장 ${t}에만 공급`}
                            className={
                              "h-7 rounded-md border px-1.5 text-xs font-semibold transition-colors " +
                              (active
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100")
                            }
                          >
                            {t === "all" ? "전체" : t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchInput(row.id, { infinite: !row.infinite })
                    }
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                      (row.infinite
                        ? "border-zinc-500 bg-zinc-700 text-white"
                        : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100")
                    }
                  >
                    ∞ 무한
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setInputs((prev) => prev.filter((r) => r.id !== row.id))
                    }
                    className={delBtn}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2. 공장 설정 -------------------------------------------------- */}
        <Section
          title="공장 설정"
          hint={`${lines.length}개 레시피 배치`}
        >
          {/* 레시피 추가 패널 */}
          <div className="border-b border-zinc-200 bg-amber-50/40 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-zinc-500">
                  자원으로 필터
                </label>
                <ItemPicker
                  value={filterItemId}
                  onSelect={setFilterItemId}
                  placeholder="자원 아이콘/이름으로 레시피 찾기…"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-zinc-500">
                  레시피 이름 검색
                </label>
                <input
                  type="text"
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  placeholder="레시피 이름…"
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-white">
              {filteredRecipes.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-zinc-400">
                  조건에 맞는 레시피가 없습니다.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {filteredRecipes.map((recipe) => (
                    <li
                      key={recipe.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-amber-50/60"
                    >
                      <FactoryIcon id={recipe.icon} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-800">
                          {recipe.name}
                        </div>
                        <RecipeFormula recipe={recipe} />
                      </div>
                      <button
                        type="button"
                        onClick={() => addLine(recipe.id)}
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

          {/* 배치된 레시피 목록 */}
          {lines.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              위에서 레시피를 추가하면 여기서 수량·입출력·공장 배치를 조정할 수
              있습니다.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {lines.map((line) => {
                const recipe = RECIPE_BY_ID.get(line.recipeId);
                if (!recipe) return null;
                const outs = Object.entries(recipe.out ?? {});
                const ins = Object.entries(recipe.in ?? {});
                return (
                  <div key={line.id} className="flex flex-col gap-3 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <FactoryIcon id={recipe.icon} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-800">
                          {recipe.name}
                        </div>
                        {recipe.producers && recipe.producers.length > 0 && (
                          <div className="truncate text-xs text-zinc-400">
                            {recipe.producers.map(itemName).join(", ")}
                          </div>
                        )}
                      </div>
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
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((r) => r.id !== line.id),
                          )
                        }
                        className={delBtn}
                      >
                        삭제
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      {/* 공장 배치 */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-500">공장</span>
                        <div className="flex gap-1">
                          {FACTORIES.map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => patchLine(line.id, { factory: f })}
                              className={
                                "h-7 w-7 rounded-md border text-xs font-semibold transition-colors " +
                                (line.factory === f
                                  ? "border-amber-500 bg-amber-500 text-white"
                                  : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100")
                              }
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 출력 (분당 산출) */}
                      {outs.map(([item, qty]) => {
                        const base = (qty * 60) / recipe.time;
                        return (
                          <div
                            key={"out-" + item}
                            className="flex items-center gap-1.5"
                            title={`${itemName(item)} 분당 산출`}
                          >
                            <FactoryIcon id={item} size={22} />
                            <div className="w-24">
                              <NumInput
                                value={line.count * base}
                                onChange={(n) =>
                                  patchLine(line.id, { count: n / base })
                                }
                                allowNegative={false}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* 입력 (분당 소비) */}
                      {ins.map(([item, qty]) => {
                        const base = (qty * 60) / recipe.time;
                        return (
                          <div
                            key={"in-" + item}
                            className="flex items-center gap-1.5"
                            title={`${itemName(item)} 분당 소비`}
                          >
                            <FactoryIcon id={item} size={22} />
                            <span className="text-xs text-red-400">−</span>
                            <div className="w-24">
                              <NumInput
                                value={line.count * base}
                                onChange={(n) =>
                                  patchLine(line.id, { count: n / base })
                                }
                                allowNegative={false}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3. 결산 ------------------------------------------------------ */}
        <Section title="결산" hint="분당 순생산 기준">
          {/* 관리권 생산량 (생산량 / 목표) */}
          <div className="flex flex-wrap items-end gap-6 border-b border-zinc-200 bg-zinc-50/70 px-5 py-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                분당 관리권 생산량
              </div>
              <div className="text-2xl font-bold tabular-nums text-amber-600">
                {voucherText}
                {targetPerMin > 0 && (
                  <span className="font-medium text-zinc-400">
                    {" / "}
                    {formatNumber(targetPerMin)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                시간당 관리권 생산량
              </div>
              <div className="text-2xl font-bold tabular-nums text-amber-600">
                {voucherHourText}
                {targetPerMin > 0 && (
                  <span className="font-medium text-zinc-400">
                    {" / "}
                    {formatNumber(targetPerMin * 60)}
                  </span>
                )}
              </div>
            </div>
            {targetPerMin > 0 && (
              <div
                className={
                  "ml-auto text-lg font-bold " +
                  (summary.voucherInf || summary.voucherPerMin >= targetPerMin
                    ? "text-blue-600"
                    : "text-red-600")
                }
              >
                {summary.voucherInf || summary.voucherPerMin >= targetPerMin
                  ? "관리권 목표 달성!"
                  : "관리권 목표 미달"}
              </div>
            )}
          </div>

          {summary.rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              입력이나 레시피를 추가하면 자원별 수지가 표시됩니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="border-b border-zinc-200 px-4 py-2.5 text-left">
                      자원
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2.5 text-right">
                      전체 합
                    </th>
                    {FACTORIES.map((f) => (
                      <th
                        key={f}
                        className="border-b border-zinc-200 px-3 py-2.5 text-right"
                      >
                        공장 {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr
                      key={row.itemId}
                      className="border-b border-zinc-100 transition-colors last:border-b-0 hover:bg-zinc-50/70"
                    >
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <FactoryIcon id={row.itemId} size={22} />
                          <span className="text-zinc-800">{row.name}</span>
                        </div>
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold tabular-nums " +
                          cellClass(row.total)
                        }
                      >
                        {cellText(row.total)}
                      </td>
                      {row.factories.map((cell, i) => {
                        const idle =
                          cell.idle !== undefined && Number.isFinite(cell.idle)
                            ? cleanNumber(cell.idle)
                            : 0;
                        return (
                          <td
                            key={i}
                            className={
                              "px-3 py-2 text-right tabular-nums " +
                              cellClass(cell)
                            }
                          >
                            <span className="inline-flex items-center justify-end gap-1">
                              {cellText(cell)}
                              {idle > 0 && (
                                <span
                                  title="이 공장에서만 남아 다른 공장은 못 씀 (전체 합에 안 잡힘)"
                                  className="rounded bg-zinc-100 px-1 text-[10px] font-medium text-zinc-400"
                                >
                                  유휴 {formatNumber(idle)}
                                </span>
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 4. 관리권 ---------------------------------------------------- */}
        <Section
          title="관리권"
          hint="자원 → 관리권 교환 설정"
          right={
            <button type="button" onClick={addVoucher} className={addBtn}>
              + 자원 추가
            </button>
          }
        >
          <div className="flex flex-wrap items-end gap-6 border-b border-zinc-200 px-5 py-4">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">목표 분당</span>
              <div className="w-28">
                <NumInput
                  value={targetPerMin}
                  onChange={setTargetPerMin}
                  allowNegative={false}
                />
              </div>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">목표 시간당</span>
              <div className="w-28">
                <NumInput
                  value={targetPerMin * 60}
                  onChange={(n) => setTargetPerMin(n / 60)}
                  allowNegative={false}
                />
              </div>
            </label>
          </div>

          {vouchers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              관리권으로 교환되는 자원과 개당 관리권 수를 추가하세요.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {vouchers.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-56 flex-1">
                    <ItemPicker
                      value={row.itemId}
                      clearable={false}
                      onSelect={(id) =>
                        id && patchVoucher(row.id, { itemId: id })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                    <span className="text-xs text-zinc-500">개당 관리권</span>
                    <div className="w-24">
                      <NumInput
                        value={row.perUnit}
                        onChange={(n) => patchVoucher(row.id, { perUnit: n })}
                        allowNegative={false}
                      />
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setVouchers((prev) => prev.filter((r) => r.id !== row.id))
                    }
                    className={delBtn}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}

// React import not required with automatic JSX runtime

export type TabKey = "putting" | "clubs" | "par3" | "approach" | "gir";

export function Tabs(props: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs: Array<{ key: TabKey; label: string }> = [
      { key: "clubs", label: "Club distances" },
    { key: "putting", label: "Putting" },
    { key: "par3", label: "Par 3s" },
    { key: "approach", label: "Approach" },
    { key: "gir", label: "GIR / round" },
  ];
  return (
    <div
      className="mb-4 flex overflow-x-auto rounded-lg bg-gray-100 p-1"
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={props.active === t.key}
          className={
            "whitespace-nowrap rounded-md px-3 py-1.5 text-sm md:text-base transition-colors duration-150 " +
            (props.active === t.key
              ? "bg-white text-gray-900 shadow"
              : "text-gray-600 hover:bg-white/60")
          }
          onClick={() => props.onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

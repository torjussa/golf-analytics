// React import not required with automatic JSX runtime

export type TabKey = "putting" | "clubs" | "par3";

export function Tabs(props: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "putting", label: "Putting" },
    { key: "clubs", label: "Club distances" },
    { key: "par3", label: "Par 3s" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        borderBottom: "1px solid #eee",
        margin: "8px 0 16px",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => props.onChange(t.key)}
          style={{
            padding: "8px 12px",
            border: "none",
            borderBottom:
              props.active === t.key
                ? "2px solid #0088FE"
                : "2px solid transparent",
            background: "transparent",
            color: props.active === t.key ? "#111" : "#666",
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

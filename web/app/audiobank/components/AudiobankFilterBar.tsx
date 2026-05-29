"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function AudiobankFilterBar({ value, onChange }: Props) {
  return (
    <div className="audiobank-filter-bar">
      <input
        type="search"
        className="imagegen-input audiobank-filter-input"
        placeholder="Filter by filename or tags…"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

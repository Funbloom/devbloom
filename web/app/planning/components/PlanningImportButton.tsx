"use client";

import { useRef } from "react";
import type { ChangeEvent, ReactElement } from "react";

const ACCEPT = ".pdf,.docx,.txt,.md";

type Props = {
  disabled?: boolean;
  onFileSelected: (file: File) => void;
};

export function PlanningImportButton({ disabled, onFileSelected }: Props): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
    event.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <button
        type="button"
        className="imagegen-button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Import plan
      </button>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

type Props = {
  value: string;
  disabled?: boolean;
  style?: CSSProperties;
  onCommit: (value: string) => void;
};

export function PlanningDateInput({
  value,
  disabled,
  style,
  onCommit,
}: Props): ReactElement {
  const [localValue, setLocalValue] = useState(value);
  const focusedRef = useRef(false);
  const committedRef = useRef(value);

  useEffect(() => {
    committedRef.current = value;
    if (!focusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const handleBlur = () => {
    focusedRef.current = false;
    if (localValue === committedRef.current) {
      return;
    }
    committedRef.current = localValue;
    onCommit(localValue);
  };

  return (
    <input
      type="date"
      value={localValue}
      disabled={disabled}
      style={style}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        setLocalValue(e.target.value);
      }}
      onBlur={handleBlur}
    />
  );
}

"use client";

import Link from "next/link";
import type { MouseEventHandler, ReactElement } from "react";

type BaseProps = {
  label?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

type ButtonProps = BaseProps & {
  onClick: MouseEventHandler<HTMLButtonElement>;
  href?: never;
};

type LinkProps = BaseProps & {
  href: string;
  onClick?: never;
};

type Props = ButtonProps | LinkProps;

export function DismissButton(props: Props): ReactElement {
  const label: string = props.label ?? "Close";
  const className: string = ["app-dismiss-button", props.className].filter(Boolean).join(" ");

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={className} aria-label={props["aria-label"] ?? label}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={props["aria-label"] ?? label}
    >
      {label}
    </button>
  );
}

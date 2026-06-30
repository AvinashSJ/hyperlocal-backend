"use client";

import { useEffect, useState, type ReactNode } from "react";

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const DEFAULT_LOCALE = "en-IN";

type BaseProps = {
  value: string | number | Date | null | undefined;
  fallback?: ReactNode;
  className?: string;
  dataTestid?: string;
};

type DateProps = BaseProps & {
  format: "date";
  options?: Intl.DateTimeFormatOptions;
  locale?: string;
};

type DateTimeProps = BaseProps & {
  format: "datetime";
  options?: Intl.DateTimeFormatOptions;
  locale?: string;
};

type TimeProps = BaseProps & {
  format: "time";
  options?: Intl.DateTimeFormatOptions;
  locale?: string;
};

type ClientDateProps = DateProps | DateTimeProps | TimeProps;

function parse(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function fallbackNode(fallback: ReactNode | undefined, dataTestid: string | undefined, className: string | undefined) {
  return (
    <span
      className={className}
      data-testid={dataTestid}
      suppressHydrationWarning
    >
      {fallback ?? "\u00A0"}
    </span>
  );
}

export default function ClientDate(props: ClientDateProps) {
  // P63: intentional setState-in-effect. This is the canonical
  // React pattern for client-only rendering to avoid hydration
  // mismatches from server/client timezone divergence in
  // toLocaleDateString. Server renders the fallback; the post-mount
  // effect flips mounted=true so the client-localized date appears.
  // See https://react.dev/reference/react/useEffect#reading-latest-state-and-props-with-effect-cleanup
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const date = parse(props.value);
  if (!date) return fallbackNode(props.fallback, props.dataTestid, props.className);

  if (!mounted) {
    return fallbackNode(props.fallback, props.dataTestid, props.className);
  }

  const locale = props.locale ?? DEFAULT_LOCALE;
  const options =
    props.options ??
    (props.format === "date"
      ? DEFAULT_DATE_OPTIONS
      : props.format === "time"
        ? undefined
        : DEFAULT_DATETIME_OPTIONS);

  const formatted =
    props.format === "date"
      ? date.toLocaleDateString(locale, options)
      : props.format === "time"
        ? date.toLocaleTimeString(locale, options)
        : date.toLocaleString(locale, options);

  return (
    <span className={props.className} data-testid={props.dataTestid}>
      {formatted}
    </span>
  );
}

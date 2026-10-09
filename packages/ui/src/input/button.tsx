import { Button as HeadlessButton } from "@headlessui/react";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { join } from "./shared";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "text"
  | "textonly"
  | "custom";
export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "style"
> & {
  variant?: ButtonVariant;
  /** Legacy alias for variant. */
  style?: ButtonVariant | CSSProperties;
  size?: "small" | "medium" | "large";
  icon?: LucideIcon;
  label?: string;
  children?: ReactNode;
  colorMode?: "light" | "auto" | "dark";
  /** Legacy button attributes. Prefer native button props. */
  properties?: {
    disabled?: boolean;
    classNames?: string;
    title?: string;
    ariaLabel?: string;
    type?: "button" | "submit" | "reset";
  };
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary-700 text-white hover:bg-primary-800",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  success: "bg-emerald-700 text-white hover:bg-emerald-800",
  danger: "bg-red-700 text-white hover:bg-red-800",
  text: "text-primary-700 hover:bg-primary-50",
  textonly: "text-primary-700 hover:bg-primary-50",
  custom: "",
};

const sizes = {
  small: "min-h-8 px-3 py-1 text-sm",
  medium: "min-h-10 px-4 py-2 text-sm",
  large: "min-h-12 px-5 py-3 text-base",
};

export function Button({
  variant,
  style,
  size = "medium",
  icon: Icon,
  label,
  children,
  colorMode: _colorMode,
  properties,
  className,
  type,
  disabled,
  title,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  void _colorMode;
  const appearance: ButtonVariant =
    variant ??
    (typeof style === "string" ? (style as ButtonVariant) : "primary");
  const content = children ?? label;
  return (
    <HeadlessButton
      {...props}
      style={typeof style === "object" ? style : undefined}
      type={type ?? properties?.type ?? "button"}
      disabled={disabled ?? properties?.disabled}
      title={title ?? properties?.title}
      aria-label={
        ariaLabel ??
        properties?.ariaLabel ??
        (typeof content === "string" ? content : undefined)
      }
      className={join(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:cursor-not-allowed",
        sizes[size],
        variants[appearance],
        properties?.classNames,
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {content}
    </HeadlessButton>
  );
}

import { Button as HeadlessButton } from "@headlessui/react";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { join } from "./shared";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "text" | "custom";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "small" | "medium" | "large";
  icon?: LucideIcon;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary-700 text-white hover:bg-primary-800",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  success: "bg-emerald-700 text-white hover:bg-emerald-800",
  danger: "bg-red-700 text-white hover:bg-red-800",
  text: "text-primary-700 hover:bg-primary-50",
  custom: "",
};
const sizes = {
  small: "min-h-8 px-3 py-1 text-sm",
  medium: "min-h-10 px-4 py-2 text-sm",
  large: "min-h-12 px-5 py-3 text-base",
};

export function Button({ variant = "primary", size = "medium", icon: Icon, children, className, type = "button", ...props }: ButtonProps) {
  return (
    <HeadlessButton {...props} type={type}
      className={join(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size], variants[variant], className,
      )}>
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </HeadlessButton>
  );
}

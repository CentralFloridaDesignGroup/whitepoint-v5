import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type MarketingButtonVariant = "primary" | "secondary" | "link" | "custom";
export type MarketingButtonSize = "small" | "medium" | "large";

export interface MarketingButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  label: string;
  variant?: MarketingButtonVariant;
  size?: MarketingButtonSize;
  href?: string;
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}

export function MarketingButton({
  label,
  variant = "primary",
  size = "medium",
  href,
  icon: Icon,
  className,
  children,
  ...buttonProps
}: MarketingButtonProps): React.JSX.Element {
  const classes = cx(
    "inline-flex cursor-pointer items-center justify-center gap-2 font-semibold transition focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
    size === "small" && "px-4 py-2 text-sm",
    size === "medium" && "px-5 py-3 text-base",
    size === "large" && "px-6 py-3.5 text-lg",
    variant === "primary" && "bg-primary text-white shadow-sm hover:bg-primary-700",
    variant === "secondary" && "border border-primary-200 bg-white text-primary shadow-sm hover:border-primary hover:bg-primary-50",
    variant === "link" && "px-0 py-0 text-primary underline-offset-4 hover:underline focus:ring-0",
    className
  );

  const content = (
    <>
      {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
      <span>{children ?? label}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...buttonProps}>
      {content}
    </button>
  );
}


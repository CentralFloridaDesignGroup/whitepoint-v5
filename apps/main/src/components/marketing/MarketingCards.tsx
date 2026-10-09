import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MarketingButton } from "./MarketingButton";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface MarketingCardLinkProps {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  className?: string;
}

export function MarketingCardLink({ title, description, href, actionLabel, className }: MarketingCardLinkProps): React.JSX.Element {
  return (
    <article className={cx("border border-primary-100 bg-white p-6 shadow-sm", className)}>
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      <p className="mt-3 text-base leading-7 text-gray-600">{description}</p>
      <div className="mt-5">
        <MarketingButton label={actionLabel} href={href} variant="primary" />
      </div>
    </article>
  );
}

export interface MarketingServiceCardProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  eyebrow?: string;
  footer?: ReactNode;
  className?: string;
}

export function MarketingServiceCard({ title, description, icon: Icon, eyebrow, footer, className }: MarketingServiceCardProps): React.JSX.Element {
  return (
    <article className={cx("flex h-full flex-col border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-200 hover:shadow-md", className)}>
      {Icon ? <Icon className="mb-5 h-12 w-12 text-primary" aria-hidden="true" /> : null}
      {eyebrow ? <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{eyebrow}</p> : null}
      <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">{description}</p>
      {footer ? <div className="mt-5 border-t border-gray-100 pt-4 text-sm text-gray-500">{footer}</div> : null}
    </article>
  );
}

export interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  title?: string;
  description?: string;
}

const sizeClasses = {
  small: "size-8 border-4",
  medium: "size-16 border-4",
  large: "size-24 border-8",
};

export function LoadingSpinner({
  size = "medium",
  title,
  description,
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-4000 flex flex-col items-center justify-center gap-3 bg-white/20 text-center backdrop-blur-xs"
    >
      <div className="flex flex-col gap-4 items-center bg-white border border-gray-400 p-4 rounded-md max-w-[800px]">
        <div
          className={`animate-spin rounded-full border-white border-t-primary-700 ${sizeClasses[size]}`}
        />
        {title && <h3 className="text-lg font-semibold">{title}</h3>}
        {description && <p className="text-sm text-slate-600">{description}</p>}
      </div>
    </div>
  );
}

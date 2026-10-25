export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function labelClass({ required, hidden }: { required?: boolean; hidden?: boolean }): string {
  return cx(
    hidden ? "sr-only" : "block text-sm/6 font-medium text-start text-gray-900",
    required && 'after:content-["*"] after:ml-0.5 after:text-red-500',
  );
}

export function errorClass(): string {
  return "mt-0.5 text-sm text-red-600 text-start";
}

export function menuClass(className?: string): string {
  return cx(
    "absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white text-sm text-gray-900 shadow-lg focus:outline-none",
    className,
  );
}

export function optionClass({ focus, selected }: { focus?: boolean; selected?: boolean }): string {
  return cx(
    "relative cursor-default select-none px-4 py-2",
    focus ? "bg-primary text-white" : "text-gray-900",
    selected && "font-semibold",
  );
}

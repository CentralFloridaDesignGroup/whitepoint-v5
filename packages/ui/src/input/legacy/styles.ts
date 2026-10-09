export type InputColorMode = "light" | "dark" | "auto";
export type LabelPosition = "top" | "side";

export function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(" ");
}

function modeClass(colorMode: InputColorMode | undefined, light: string, dark: string, auto: string): string {
    void colorMode;
    void dark;
    void auto;
    return light;
}

export function labelClass({
    colorMode = "light",
    required,
    hidden,
    labelPosition = "top",
    className
}: {
    colorMode?: InputColorMode;
    required?: boolean;
    hidden?: boolean;
    labelPosition?: LabelPosition;
    className?: string;
}): string {
    return cx(
        hidden ? "sr-only" : "block text-sm/6 font-medium text-start",
        modeClass(colorMode, "text-gray-900", "text-gray-100", "text-gray-900 "),
        required && "after:content-[\"*\"] after:ml-0.5 after:text-red-500",
        labelPosition === "side" && !hidden && "shrink-0 whitespace-nowrap",
        className
    );
}

export function fieldShellClass(labelPosition: LabelPosition = "top"): string {
    return cx("flex w-full", labelPosition === "side" ? "flex-row items-center gap-2" : "flex-col gap-1");
}

export function controlClass({
    invalid,
    disabled,
    className
}: {
    colorMode?: InputColorMode;
    invalid?: boolean;
    disabled?: boolean;
    className?: string;
}): string {
    return cx(
        "block w-full rounded-md border bg-white px-3 py-2 text-sm/6 text-gray-900 shadow-sm transition-colors placeholder:text-gray-400",
        invalid ? "border-red-500 focus:border-red-600" : "border-gray-300 focus:border-primary",
        "focus:outline-none focus:ring-2 focus:ring-primary/20",
        disabled && "cursor-default border-transparent bg-gray-50 opacity-50",
        className
    );
}

export function errorClass(): string {
    return "mt-0.5 text-sm text-red-600 text-start";
}

export function menuClass(colorMode: InputColorMode = "light", className?: string): string {
    return cx(
        "absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border text-sm shadow-lg focus:outline-none",
        modeClass(colorMode, "border-gray-200 bg-white text-gray-900", "border-gray-700 bg-gray-800 text-gray-100", "border-gray-200 bg-white text-gray-900   "),
        className
    );
}

export function optionClass({
    colorMode = "light",
    focus,
    selected
}: {
    colorMode?: InputColorMode;
    focus?: boolean;
    selected?: boolean;
}): string {
    return cx(
        "relative cursor-default select-none px-4 py-2",
        focus
            ? modeClass(colorMode, "bg-primary text-white", "bg-primary-500 text-white", "bg-primary text-white ")
            : modeClass(colorMode, "text-gray-900", "text-gray-100", "text-gray-900 "),
        selected && "font-semibold"
    );
}

export function buttonClass({
    variant,
    size = "medium",
    colorMode = "light",
    className
}: {
    variant: "primary" | "secondary" | "danger" | "success" | "textonly";
    size?: "small" | "medium" | "large";
    colorMode?: InputColorMode;
    className?: string;
}): string {
    const sizeClasses = {
        small: "px-2 py-1.5 text-sm",
        medium: "px-3 py-2 text-base",
        large: "px-4 py-2.5 text-lg"
    };
    const variantClasses = {
        primary: modeClass(colorMode, "bg-primary text-white hover:bg-primary-700 disabled:bg-primary-300", "bg-primary-500 text-white hover:bg-primary-600 disabled:bg-primary-300", "bg-primary text-white hover:bg-primary-700 disabled:bg-primary-300  "),
        secondary: modeClass(colorMode, "bg-gray-200 text-gray-900 hover:bg-gray-300 disabled:bg-gray-100", "bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:bg-gray-800", "bg-gray-200 text-gray-900 hover:bg-gray-300 disabled:bg-gray-100    "),
        danger: modeClass(colorMode, "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300", "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300", "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300  "),
        success: modeClass(colorMode, "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300", "bg-green-500 text-white hover:bg-green-600 disabled:bg-green-300", "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300  "),
        textonly: modeClass(colorMode, "bg-transparent text-primary hover:bg-primary/10 disabled:text-gray-400", "bg-transparent text-white hover:bg-primary-500/10 disabled:text-gray-400", "bg-transparent text-primary hover:bg-primary/10 disabled:text-gray-400  ")
    };

    return cx(
        "inline-flex items-center justify-center gap-2 rounded-md border border-transparent font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/35 cursor-pointer active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:text-gray-500",
        sizeClasses[size],
        variantClasses[variant],
        className
    );
}

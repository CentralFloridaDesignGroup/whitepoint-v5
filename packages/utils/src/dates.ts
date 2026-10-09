/**
 * Converts a Date object or date string into a formatted string based on the provided format.
 * The function handles timezone adjustments to ensure the date is represented correctly.
 * It supports both custom string formats (e.g., "MM/dd/yyyy") and Intl.DateTimeFormat options.
 * @param date date to be formatted, which can be a Date object or a date string.
 * @param format either a custom format string (e.g., "MM/dd/yyyy") or an Intl.DateTimeFormat options object to specify the desired output format.
 * @returns string representing the formatted date according to the specified format.
 */
export function formatDate(
    date: Date | string,
    format: string | Intl.DateTimeFormatOptions = "MM/dd/yyyy"
): string {
    if (typeof date === "string") {
        date = new Date(date);
    }
    if (isNaN(date.getTime())) {
        return ""; // Return empty string for invalid dates
    }
    const correctedDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    if (typeof format === "string") {
        const map: { [key: string]: string } = {
            "MMMM": correctedDate.toLocaleString("en-US", { month: "long" }),
            "MMM": correctedDate.toLocaleString("en-US", { month: "short" }),
            "MM": String(correctedDate.getMonth() + 1).padStart(2, "0"),
            "M": String(correctedDate.getMonth() + 1),
            "dd": String(correctedDate.getDate()).padStart(2, "0"),
            "d": String(correctedDate.getDate()),
            "yyyy": String(correctedDate.getFullYear()),
            "yy": String(correctedDate.getFullYear()).slice(-2),
            "HH": String(correctedDate.getHours()).padStart(2, "0"),
            "mm": String(correctedDate.getMinutes()).padStart(2, "0"),
            "ss": String(correctedDate.getSeconds()).padStart(2, "0")
        };
        return format.replace(/MMMM|MMM|MM|M|dd|d|yyyy|yy|HH|mm|ss/g, matched => map[matched] ?? matched);
    } else {
        return new Intl.DateTimeFormat("en-US", format).format(correctedDate);
    }
}

/**
 * Calculates the number of days remaining until the specified end date.
 * @param endDate The end date, which can be a Date object or a date string. Use "0" for positions with no end date.
 * @returns The number of days remaining until the end date. Returns Infinity for positions with no end date and 0 for invalid dates.
 */
export function getDaysRemaining(endDate: Date | string): number {
    if (typeof endDate === "string") {
        if (endDate === "0") {
            return Infinity; // Return Infinity for positions with no end date
        }
        endDate = new Date(endDate);
    }
    if (isNaN(endDate.getTime())) {
        return 0; // Return 0 for invalid dates
    }
    const correctedDate = new Date(endDate.getTime() + endDate.getTimezoneOffset() * 60000);
    const today = new Date();
    const correctedToday = new Date(today.getTime() + today.getTimezoneOffset() * 60000);   
    const timeDiff = correctedDate.getTime() - correctedToday.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

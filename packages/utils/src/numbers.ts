/**
 * Formats a number according to the specified options.
 *
 * @param value - The number to format.
 * @param options - The formatting options.
 * @returns The formatted number as a string.
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat("en-US", options).format(value);
}

/**
 * Calculates the distance between two coordinates.
 *
 * @param startX - The X coordinate of the starting point.
 * @param startY - The Y coordinate of the starting point.
 * @param endX - The X coordinate of the ending point.
 * @param endY - The Y coordinate of the ending point.
 * @returns The distance between the two points.
 */
export function distanceFromCoordinates(startX: number, startY: number, endX: number, endY: number): number {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}
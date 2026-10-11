/** Width of the y-axis gutter: the longest tick label at the axis font (about 6.6 units a character) plus the tick gap. */
export const axisGutter = (labels: string[], min = 64) => Math.max(min, Math.ceil(Math.max(0, ...labels.map((l) => l.length)) * 6.6) + 14)

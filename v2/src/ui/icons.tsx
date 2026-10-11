const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, viewBox: '0 0 24 24' } as const
export const CheckIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M20 6 9 17l-5-5" /></svg>
export const XIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M18 6 6 18M6 6l12 12" /></svg>
export const ClockIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>

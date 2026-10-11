const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, viewBox: '0 0 24 24' } as const
export const CheckIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M20 6 9 17l-5-5" /></svg>
export const XIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M18 6 6 18M6 6l12 12" /></svg>
export const ClockIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
export const PlusIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M5 12h14M12 5v14" /></svg>
export const TrashIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
export const GripIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" /></svg>
export const UpIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="m18 15-6-6-6 6" /></svg>
export const DownIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="m6 9 6 6 6-6" /></svg>
export const BackIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="m15 18-6-6 6-6" /></svg>
export const PencilIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
export const StopIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
export const RightIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="m9 18 6-6-6-6" /></svg>

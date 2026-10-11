import type { ReactNode } from 'react'

// Duotone set (design/components/Icon): rounded 2px strokes over a soft 14% fill of the same colour.
type P = { size?: number }
const Duo = ({ size = 16, fill, line }: { size?: number; fill?: ReactNode; line: ReactNode }) => (
  <svg className="rnr-ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    {fill && <g className="fill">{fill}</g>}
    <g className="line">{line}</g>
  </svg>
)

export const CheckIcon = ({ size }: P) => <Duo size={size} line={<path d="m5 12.5 4.5 4.5L19 7.5" />} />
export const XIcon = ({ size }: P) => <Duo size={size} line={<path d="M6 6l12 12M18 6 6 18" />} />
export const ClockIcon = ({ size }: P) => <Duo size={size} fill={<circle cx="12" cy="12" r="8.5" />} line={<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>} />
export const PlusIcon = ({ size }: P) => <Duo size={size} line={<path d="M12 5v14M5 12h14" />} />
export const TrashIcon = ({ size }: P) => <Duo size={size} fill={<path d="M6 7h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />} line={<path d="M4 7h16M9 7V4.5h6V7M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />} />
export const GripIcon = ({ size }: P) => <Duo size={size} line={<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" style={{ strokeWidth: 3 }} />} />
export const UpIcon = ({ size }: P) => <Duo size={size} line={<path d="m18 15-6-6-6 6" />} />
export const DownIcon = ({ size }: P) => <Duo size={size} line={<path d="m6 9 6 6 6-6" />} />
export const BackIcon = ({ size }: P) => <Duo size={size} line={<path d="m15 18-6-6 6-6" />} />
export const PencilIcon = ({ size }: P) => <Duo size={size} fill={<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />} line={<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />} />
export const StopIcon = ({ size }: P) => <Duo size={size} fill={<rect x="6" y="6" width="12" height="12" rx="3" />} line={<rect x="6" y="6" width="12" height="12" rx="3" />} />
export const RightIcon = ({ size }: P) => <Duo size={size} line={<path d="m9 6 6 6-6 6" />} />
export const BellIcon = ({ size }: P) => <Duo size={size} fill={<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z" />} line={<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10.3 20.5a1.9 1.9 0 0 0 3.4 0" />} />
export const DownloadIcon = ({ size }: P) => <Duo size={size} fill={<path d="M4 15h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />} line={<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />} />
export const MoreIcon = ({ size }: P) => <Duo size={size} line={<path d="M12 5h.01M12 12h.01M12 19h.01" style={{ strokeWidth: 3 }} />} />

// Navigation
export const InboxIcon = ({ size }: P) => <Duo size={size} fill={<path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />} line={<path d="M4 13 6.5 5.6A1 1 0 0 1 7.4 5h9.2a1 1 0 0 1 .9.6L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 13h4.5l1.5 2.5h4l1.5-2.5H20" />} />
export const RecordsIcon = ({ size }: P) => <Duo size={size} fill={<rect x="4" y="4" width="16" height="5" rx="2" />} line={<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9h16M4 14.5h16M9 9v11" /></>} />
export const DashboardIcon = ({ size }: P) => <Duo size={size} fill={<><rect x="4" y="4" width="7" height="9" rx="2" /><rect x="13" y="11" width="7" height="9" rx="2" /></>} line={<><rect x="4" y="4" width="7" height="9" rx="2" /><rect x="13" y="4" width="7" height="5" rx="2" /><rect x="13" y="11" width="7" height="9" rx="2" /><rect x="4" y="15" width="7" height="5" rx="2" /></>} />
export const ReportIcon = ({ size }: P) => <Duo size={size} fill={<><rect x="5" y="11" width="3.5" height="8" rx="1" /><rect x="15.5" y="5" width="3.5" height="14" rx="1" /></>} line={<><path d="M4 20h16" /><rect x="5" y="11" width="3.5" height="8" rx="1" /><rect x="10.25" y="8" width="3.5" height="11" rx="1" /><rect x="15.5" y="5" width="3.5" height="14" rx="1" /></>} />
export const FormIcon = ({ size }: P) => <Duo size={size} fill={<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />} line={<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />} />
export const FlowIcon = ({ size }: P) => <Duo size={size} fill={<><rect x="3" y="4" width="7" height="6" rx="2" /><rect x="14" y="14" width="7" height="6" rx="2" /></>} line={<><rect x="3" y="4" width="7" height="6" rx="2" /><rect x="14" y="14" width="7" height="6" rx="2" /><path d="M10 7h3a3 3 0 0 1 3 3v4" /></>} />
export const TemplateIcon = ({ size }: P) => <Duo size={size} fill={<rect x="3" y="5" width="18" height="14" rx="3" />} line={<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>} />
export const MessageIcon = ({ size }: P) => <Duo size={size} fill={<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z" />} line={<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4zM8 9h8M8 12.5h5" />} />
export const CampaignIcon = ({ size }: P) => <Duo size={size} fill={<path d="M4 10v4l11 5V5z" />} line={<path d="M4 10v4l11 5V5L4 10zM15 9a3 3 0 0 1 0 6M7 15l1 5h3l-1-4" />} />
export const PeopleIcon = ({ size }: P) => <Duo size={size} fill={<circle cx="9" cy="8" r="3.5" />} line={<><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c1.6.8 2.7 2.6 3 5.2" /></>} />
export const ShieldIcon = ({ size }: P) => <Duo size={size} fill={<path d="M12 3 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />} line={<><path d="M12 3 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="m9 12 2 2 4-4.5" /></>} />
export const SettingsIcon = ({ size }: P) => <Duo size={size} fill={<circle cx="12" cy="12" r="3" />} line={<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>} />
export const LogoutIcon = ({ size }: P) => <Duo size={size} line={<path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4M15 16l4-4-4-4M19 12H9" />} />

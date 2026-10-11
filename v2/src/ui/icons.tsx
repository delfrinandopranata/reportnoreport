import type { ComponentType } from 'react'
import {
  ArrowLeftIcon, ArrowRightIcon as PhArrowRight, ArrowUpRightIcon as PhArrowUpRight, BellSimpleIcon, CaretDownIcon, CaretRightIcon,
  CaretUpIcon, ChartLineUpIcon, CheckIcon as PhCheck, ClockIcon as PhClock, DatabaseIcon, DotsSixVerticalIcon, DotsThreeVerticalIcon,
  DownloadSimpleIcon, EnvelopeSimpleIcon, FileTextIcon, GearSixIcon, GitBranchIcon, ListIcon, MagnifyingGlassIcon, MegaphoneIcon,
  MinusIcon as PhMinus, NotePencilIcon, PencilSimpleIcon, PlusIcon as PhPlus, ShieldCheckIcon, SquaresFourIcon, StopIcon as PhStop,
  TrashIcon as PhTrash, TrayIcon, UsersThreeIcon, XIcon as PhX, type Icon,
} from '@phosphor-icons/react'
import type { NavIcon } from './nav'

export type IconComponent = ComponentType<{ size?: number }>
/** Every icon is decorative: the control around it carries the name. Phosphor regular, currentColor. */
const icon = (C: Icon): IconComponent => ({ size = 16 }) => <C size={size} aria-hidden="true" focusable="false" />

export const CheckIcon = icon(PhCheck)
export const XIcon = icon(PhX)
export const ClockIcon = icon(PhClock)
export const PlusIcon = icon(PhPlus)
export const TrashIcon = icon(PhTrash)
export const GripIcon = icon(DotsSixVerticalIcon)
export const UpIcon = icon(CaretUpIcon)
export const DownIcon = icon(CaretDownIcon)
export const BackIcon = icon(ArrowLeftIcon)
export const PencilIcon = icon(PencilSimpleIcon)
export const StopIcon = icon(PhStop)
export const RightIcon = icon(CaretRightIcon)
export const BellIcon = icon(BellSimpleIcon)
export const DownloadIcon = icon(DownloadSimpleIcon)
export const MoreIcon = icon(DotsThreeVerticalIcon)
export const SearchIcon = icon(MagnifyingGlassIcon)
export const GearIcon = icon(GearSixIcon)
export const MenuIcon = icon(ListIcon)
export const ArrowRightIcon = icon(PhArrowRight)
export const ArrowUpRightIcon = icon(PhArrowUpRight)
export const MinusIcon = icon(PhMinus)

export const NAV_ICONS: Record<NavIcon, IconComponent> = {
  inbox: icon(TrayIcon), records: icon(DatabaseIcon), dashboard: icon(SquaresFourIcon), reports: icon(ChartLineUpIcon),
  forms: icon(NotePencilIcon), workflows: icon(GitBranchIcon), templates: icon(FileTextIcon), campaigns: icon(MegaphoneIcon),
  members: icon(UsersThreeIcon), roles: icon(ShieldCheckIcon), messages: icon(EnvelopeSimpleIcon),
}

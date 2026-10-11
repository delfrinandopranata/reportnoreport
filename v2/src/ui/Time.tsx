import { dayText, whenText } from './dates'

export const Day = ({ iso }: { iso: string }) => <time dateTime={iso}>{dayText(iso)}</time>
export const When = ({ iso }: { iso: string }) => <time dateTime={iso}>{whenText(iso)}</time>

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import type { MutableKind, TemplateKind } from './logic'

export type TemplateRow = {
  id: string; org_id: string; kind: TemplateKind; name: string; channel: 'email' | 'in_app'
  subject: string; body: string; is_system: boolean; updated_at: string
}
const TEMPLATE_COLS = 'id, org_id, kind, name, channel, subject, body, is_system, updated_at'

export const useTemplates = (orgId: string | null) => useQuery({
  queryKey: ['templates', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('message_templates').select(TEMPLATE_COLS).eq('org_id', orgId!)
      .order('is_system', { ascending: false }).order('name')
    if (error) throw error
    return data as TemplateRow[]
  },
})

export type Notification = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string }
export const NOTIFICATION_LIMIT = 20 // shortcut: newest 20 in the dropdown; add a full notifications page when people ask for history

export const useNotifications = (orgId: string | null, userId: string) => useQuery({
  queryKey: ['notifications', userId, orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('notifications').select('id, title, body, link, read_at, created_at')
      .eq('org_id', orgId!).eq('user_id', userId).order('created_at', { ascending: false }).limit(NOTIFICATION_LIMIT)
    if (error) throw error
    return data as Notification[]
  },
})

export const useUnreadCount = (orgId: string | null, userId: string) => useQuery({
  queryKey: ['notifications-unread', userId, orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId!).eq('user_id', userId).is('read_at', null)
    if (error) throw error
    return count ?? 0
  },
})

/** Live bell: any change to my notifications refetches the list and the count. RLS decides what is sent; the filter saves traffic. */
export function useNotificationFeed(orgId: string | null, userId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!orgId) return
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['notifications', userId, orgId] })
      void qc.invalidateQueries({ queryKey: ['notifications-unread', userId, orgId] })
    }
    const channel = supabase.channel(`notifications:${userId}:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId, userId, qc])
}

// Zero rows back is not a failure here: another tab already marked them read.
export const markRead = (id: string) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null).select('id')
export const markAllRead = (orgId: string, userId: string) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('org_id', orgId).eq('user_id', userId).is('read_at', null).select('id')

/** type -> email on; a type with no row is on. */
export const usePrefs = (userId: string) => useQuery({
  queryKey: ['notification-prefs', userId],
  queryFn: async () => {
    const { data, error } = await supabase.from('notification_prefs').select('type, email_enabled')
    if (error) throw error
    return new Map(data.map((p) => [p.type as MutableKind, p.email_enabled]))
  },
})
export const setEmailPref = (userId: string, type: MutableKind, enabled: boolean) =>
  supabase.from('notification_prefs')
    .upsert({ user_id: userId, type, email_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id,type' })
    .select('type')

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Send } from 'lucide-react'
import { useAccessInfo, useCreateInvite, useUsers } from '@/hooks/use-finance-data'
import { useCurrentUser } from '@/lib/auth'
import { inviteLink, shareLink } from '@/lib/bot'
import { openTelegramLink } from '@/lib/telegram'
import type { InviteKind } from '@/types/domain'

const SHARE_TEXT: Record<InviteKind, string> = {
  partner: 'Присоединяйся к нашей семье в Hlow Flow — общий бюджет и план по долгам.',
  household: 'Приглашение в Hlow Flow — бюджет, чеки и план погашения долгов прямо в Telegram.',
}

/**
 * Семья и приглашения (0017_households_and_invites.sql): в семье максимум
 * двое — позвать можно одного партнёра; админ ещё и зовёт новые семьи, пока
 * в приложении есть места. Ссылка одноразовая, живёт 7 дней. То же самое
 * есть в боте: /partner и /invite.
 */
export function FamilySection() {
  const me = useCurrentUser()
  const { data: members } = useUsers()
  const { data: access } = useAccessInfo()
  const createInvite = useCreateInvite()
  const [links, setLinks] = useState<Partial<Record<InviteKind, string>>>({})

  if (!access) return null
  const seatsLeft = access.users < access.max_users
  const canInvitePartner = access.members < access.max_members && seatsLeft

  async function invite(kind: InviteKind) {
    const code = await createInvite.mutateAsync(kind)
    setLinks((l) => ({ ...l, [kind]: inviteLink(code) }))
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Ссылка скопирована')
    } catch {
      toast.error('Не получилось скопировать — отправь через «Поделиться»')
    }
  }

  const linkBox = (kind: InviteKind) => {
    const url = links[kind]
    if (!url) return null
    return (
      <div className="space-y-2 rounded-[12px] bg-hf-card p-3">
        <p className="break-all font-mono text-[11px] text-hf-text-2">{url}</p>
        <p className="text-[11px] text-hf-text-4">Одноразовая, действует 7 дней.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openTelegramLink(shareLink(url, SHARE_TEXT[kind]))}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-hf-accent py-2 text-xs font-medium text-white"
          >
            <Send className="h-3.5 w-3.5" />
            Поделиться
          </button>
          <button
            type="button"
            onClick={() => copy(url)}
            className="flex items-center justify-center gap-1.5 rounded-[10px] bg-hf-bar px-3 py-2 text-xs text-hf-text-2"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-hf-line pt-4">
      <p className="text-[13px] font-medium text-hf-text">Семья</p>
      <ul className="space-y-1.5">
        {(members ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-hf-card px-3 py-2.5">
            <span className="truncate text-[13px] text-hf-text-2">{m.display_name}</span>
            <span className="shrink-0 font-mono text-[11px] text-hf-text-4">{m.id === me.id ? 'ты' : 'партнёр'}</span>
          </li>
        ))}
      </ul>

      {canInvitePartner ? (
        <>
          <button
            type="button"
            onClick={() => invite('partner')}
            disabled={createInvite.isPending}
            className="w-full rounded-[12px] bg-hf-card py-2.5 text-[13px] text-hf-accent-on-dark disabled:opacity-50"
          >
            Пригласить партнёра
          </button>
          {linkBox('partner')}
        </>
      ) : (
        <p className="text-[11px] leading-snug text-hf-text-4">
          {access.members >= access.max_members
            ? 'В семье двое — больше добавить нельзя.'
            : 'Мест в приложении сейчас нет — партнёра можно будет позвать, когда освободятся.'}
        </p>
      )}

      {access.is_admin && (
        <div className="space-y-2 rounded-[12px] border border-hf-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-hf-text-2">Доступ к приложению</span>
            <span className="font-mono text-[11px] text-hf-text-4">
              {access.users} из {access.max_users} человек
            </span>
          </div>
          <button
            type="button"
            onClick={() => invite('household')}
            disabled={!seatsLeft || createInvite.isPending}
            className="w-full rounded-[10px] bg-hf-card py-2.5 text-[13px] text-hf-accent-on-dark disabled:opacity-50"
          >
            {seatsLeft ? 'Пригласить новую семью' : 'Мест нет'}
          </button>
          {linkBox('household')}
        </div>
      )}
    </div>
  )
}

import { Mascot } from '@/components/Mascot'
import { closeApp, openTelegramLink } from '@/lib/telegram'
import { REQUEST_ACCESS_URL } from '@/lib/bot'
import type { AccessDenied } from '@/lib/auth'

const TEXT: Record<AccessDenied, { title: string; body: string; canRequest: boolean }> = {
  invite_required: {
    title: 'Пока по приглашениям',
    body: 'Hlow Flow открыт для небольшого круга. Если тебе прислали ссылку — открой её и нажми «Старт» в боте. Если ссылки нет — оставь заявку, она придёт админу.',
    canRequest: true,
  },
  invite_invalid: {
    title: 'Ссылка не работает',
    body: 'Приглашение уже использовали или прошло 7 дней. Попроси новое — или оставь заявку админу.',
    canRequest: true,
  },
  limit_reached: {
    title: 'Мест пока нет',
    body: 'Все места в приложении заняты. Оставь заявку — напишем, как только освободится.',
    canRequest: true,
  },
  family_full: {
    title: 'В этой семье уже двое',
    body: 'В одну семью можно добавить только одного человека. Если нужна своя семья — оставь заявку админу.',
    canRequest: true,
  },
}

/** Вместо приложения — для тех, у кого нет доступа (lib/auth.ts, auth-telegram). */
export function AccessScreen({ code }: { code: AccessDenied }) {
  const t = TEXT[code]
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center justify-center gap-5 bg-hf-bg px-6 text-center"
      style={{ height: 'var(--tg-height, 100dvh)' }}
    >
      <div className="h-[150px] w-[120px]">
        <Mascot expression={code === 'invite_required' ? 'calm' : 'alert'} />
      </div>
      <h1 className="text-[22px] font-semibold text-hf-text">{t.title}</h1>
      <p className="max-w-[30ch] text-[13px] leading-relaxed text-hf-text-3">{t.body}</p>
      <div className="flex w-full flex-col gap-2.5 pt-2">
        {t.canRequest && (
          <button
            type="button"
            onClick={() => openTelegramLink(REQUEST_ACCESS_URL)}
            className="rounded-[14px] bg-hf-accent py-3.5 text-sm font-medium text-white"
          >
            Оставить заявку
          </button>
        )}
        <button type="button" onClick={closeApp} className="text-[13px] text-hf-text-4">
          Закрыть
        </button>
      </div>
    </div>
  )
}

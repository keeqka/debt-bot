import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { TgStar } from '@/components/chrome/TgStar'
import { useSubscription } from '@/hooks/use-finance-data'
import { createStarsInvoice } from '@/lib/api'
import { openInvoice } from '@/lib/telegram'

const PRICE = 500

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso))
}

/**
 * Подписка звёздами Telegram. Пока доступ бесплатный по приглашению, это
 * донат: ничего не открывает, только поддерживает проект. Оплату
 * подтверждает бот (successful_payment → subscriptions.paid_until).
 */
export function SupportSection() {
  const { data: subscription } = useSubscription()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const paidUntil = subscription?.paid_until && new Date(subscription.paid_until) > new Date() ? subscription.paid_until : null

  async function support() {
    setBusy(true)
    try {
      const url = await createStarsInvoice()
      const status = await openInvoice(url)
      if (status === 'paid') {
        toast.success('Спасибо! Поддержка оформлена')
        // Бот записывает платёж через пару секунд после оплаты.
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['subscription'] }), 3000)
      } else if (status === 'failed') {
        toast.error('Оплата не прошла')
      } else if (status === 'unavailable') {
        toast.error('Оплата работает только внутри Telegram')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не получилось открыть оплату')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-hf-line pt-4">
      <p className="text-[13px] font-medium text-hf-text">Поддержать Hlow Flow</p>
      {paidUntil ? (
        <p className="text-[13px] leading-snug text-hf-text-3">
          Ты поддерживаешь проект до {dayLabel(paidUntil)}. Подписка продлевается сама; отменить — в Telegram: Настройки → Мои
          звёзды.
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-snug text-hf-text-3">
            Сейчас всё бесплатно по приглашению. Если Hlow Flow помогает — поддержи подпиской на месяц. Отменить можно в
            любой момент.
          </p>
          <button
            type="button"
            onClick={support}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-[13px] bg-hf-accent py-3 text-[15px] font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Открываю оплату…' : (
              <>
                Поддержать — {PRICE}
                <TgStar size={18} />
                <span className="font-normal text-white/80">в месяц</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}

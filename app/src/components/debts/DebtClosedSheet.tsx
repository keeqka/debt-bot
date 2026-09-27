import { FormSheet } from '@/components/chrome/FormSheet'
import { Mascot } from '@/components/Mascot'
import { formatMoney } from '@/lib/format'

export interface ClosedDebtInfo {
  title: string
  currency: string
  /** Проценты, которые ушли бы банку при одних минимальных платежах; null — минимумы не покрывали проценты. */
  interestSaved: number | null
  freedMonthly: number
  /** Куда теперь идёт освободившийся платёж. */
  next: { kind: 'debt'; title: string } | { kind: 'goals' } | { kind: 'free' }
}

/**
 * Закрытие долга (FUNCTIONAL.md §4): маскот `happy` с подпрыгом, что это дало
 * в деньгах и куда теперь идёт освободившийся платёж. Голос — PERSONA: без
 * «молодец» и восклицаний, только последствие.
 */
export function DebtClosedSheet({ info, onClose }: { info: ClosedDebtInfo | null; onClose: () => void }) {
  if (!info) return null
  const nextLine =
    info.next.kind === 'debt'
      ? `теперь они идут в «${info.next.title}»`
      : info.next.kind === 'goals'
        ? 'долгов больше нет — теперь они идут в цели'
        : 'долгов больше нет — это теперь свободные деньги'

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Долг закрыт"
      footer={
        <button type="button" onClick={onClose} className="w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white">
          Дальше
        </button>
      }
    >
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <div className="h-[140px] w-[112px]">
          <Mascot expression="happy" bounce />
        </div>
        <p className="text-[17px] font-medium text-hf-text">«{info.title}» закрыт.</p>
        <div className="space-y-2 text-[13px] leading-snug text-hf-text-3">
          {info.interestSaved != null && info.interestSaved > 0 && (
            <p>
              На одних минимальных платежах банку ушло бы ещё{' '}
              <span className="font-mono text-hf-text">{formatMoney(info.interestSaved, info.currency)}</span> процентов.
            </p>
          )}
          {info.interestSaved == null && <p>Минимальные платежи не покрывали проценты — без досрочных он бы не закрылся никогда.</p>}
          {info.freedMonthly > 0 && (
            <p>
              <span className="font-mono text-hf-text">{formatMoney(info.freedMonthly, info.currency)}</span> в месяц освободились — {nextLine}.
            </p>
          )}
        </div>
      </div>
    </FormSheet>
  )
}

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { FormSheet, FormField, formInputClass } from '@/components/chrome/FormSheet'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { useAddAnnualExpense, useAnnualExpenses, useDeleteAnnualExpense, useMonth, useUpdateAnnualExpense } from '@/hooks/use-finance-data'
import { annualMonthsLeft } from '@/lib/budget'
import { formatMoney } from '@/lib/format'
import { MONTH_NAMES } from '@/lib/month'
import type { AnnualExpense } from '@/types/domain'

/**
 * «Крупные траты» (03): страховка, отпуск, налог — под них каждый месяц
 * откладывается резерв, и он входит в обязательства бюджета: план по долгам и
 * подушке пересчитывается. Резерв = (сумма − отложено) / месяцев до срока.
 */
export function AnnualExpensesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: items } = useAnnualExpenses()
  const month = useMonth()
  const add = useAddAnnualExpense()
  const update = useUpdateAnnualExpense()
  const remove = useDeleteAnnualExpense()
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const today = new Date()
  const list = [...(items ?? [])]
    .map((a) => ({ ...a, left: annualMonthsLeft(a.month, today), reserve: Math.max(0, a.amount - a.saved) / annualMonthsLeft(a.month, today) }))
    .sort((a, b) => a.left - b.left)
  const nearest = list[0]

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Крупные траты года"
      footer={
        <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white">
          <Plus className="h-4 w-4" />
          Добавить трату
        </button>
      }
    >
      <Paper className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">Резерв в месяц</span>
          <span className="font-mono text-[15px] font-medium text-hf-accent-ink">{formatMoney(Math.round(month?.annualReserve ?? list.reduce((s, a) => s + a.reserve, 0)))}</span>
        </div>
        {list.length === 0 ? (
          <p className="text-[13px] text-hf-ink-soft">Пока пусто. Добавь то, что платишь раз в год, — буду откладывать понемногу, а не искать деньги в последний момент.</p>
        ) : (
          list.map((a) => (
            <div key={a.id} className="flex flex-col gap-1.5 border-t border-hf-receipt-line pt-2.5">
              <button type="button" onClick={() => setOpenId(openId === a.id ? null : a.id)} className="flex min-h-11 w-full items-center justify-between gap-2.5 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{a.title}</span>
                  <span className="block text-[11px] text-hf-ink-soft">
                    {MONTH_NAMES[a.month - 1]} · {formatMoney(a.amount)} · отложено {formatMoney(a.saved)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[12px]">{formatMoney(Math.round(a.reserve))}/мес</span>
              </button>
              {openId === a.id && <ItemActions item={a} reserve={a.reserve} onSave={(saved) => update.mutate({ id: a.id, patch: { saved } })} onDelete={() => { remove.mutate(a.id); setOpenId(null); toast.success('Удалено') }} />}
            </div>
          ))
        )}
      </Paper>

      {nearest && (
        <div className="space-y-2 rounded-[16px] bg-hf-card p-3.5">
          <span className="font-mono text-[11px] tracking-[0.1em] text-hf-text-4 uppercase">Ближайшая</span>
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="min-w-0 truncate text-[15px] font-medium text-hf-text">{nearest.title}</span>
            <span className="shrink-0 font-mono text-[11px] text-hf-text-4">
              {nearest.left === 1 ? 'в этом месяце' : `через ${nearest.left} мес`}
            </span>
          </div>
          <ProgressBar pct={Math.min(100, (nearest.saved / nearest.amount) * 100)} />
          <p className="text-[12px] text-hf-text-3">
            Отложено {formatMoney(nearest.saved)} из {formatMoney(nearest.amount)}; осталось {formatMoney(Math.max(0, nearest.amount - nearest.saved))}.
          </p>
        </div>
      )}

      <p className="text-[11px] leading-snug text-hf-text-4">
        Резерв вычитается из денег «сверх минимумов», поэтому долги и подушка закроются чуть позже. Деньги в резерв переводишь сам — кнопкой «Отложить» у траты.
      </p>

      <AddForm
        open={adding}
        onClose={() => setAdding(false)}
        pending={add.isPending}
        onSubmit={async (v) => {
          await add.mutateAsync(v)
          toast.success('Крупная трата добавлена')
          setAdding(false)
        }}
      />
    </FormSheet>
  )
}

function ItemActions({ item, reserve, onSave, onDelete }: { item: AnnualExpense; reserve: number; onSave: (saved: number) => void; onDelete: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(reserve)))
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Сколько отложить"
        className="h-11 min-w-0 flex-1 rounded-[10px] border border-hf-receipt-line bg-hf-receipt px-2.5 text-right font-mono text-[13px]"
      />
      <button
        type="button"
        onClick={() => {
          const n = Number(amount)
          if (n > 0) {
            onSave(item.saved + n)
            toast.success(`Отложено ${formatMoney(n)}`)
          }
        }}
        className="min-h-11 rounded-[10px] bg-hf-accent px-4 text-[13px] font-medium text-white"
      >
        Отложить
      </button>
      <button type="button" onClick={onDelete} aria-label={`Удалить ${item.title}`} className="grid h-11 w-11 place-items-center rounded-[10px] bg-hf-receipt-line text-hf-warn-ink">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function AddForm({
  open,
  onClose,
  pending,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  pending: boolean
  onSubmit: (v: Omit<AnnualExpense, 'id'>) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [dueMonth, setDueMonth] = useState(String(new Date().getMonth() + 1))
  const [saved, setSaved] = useState('')

  async function submit() {
    const a = Number(amount)
    if (!title.trim() || !(a > 0)) {
      toast.error('Укажи название и сумму')
      return
    }
    await onSubmit({ title: title.trim(), amount: a, month: Number(dueMonth), saved: Math.max(0, Number(saved) || 0) })
    setTitle('')
    setAmount('')
    setSaved('')
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Новая крупная трата"
      footer={
        <button type="button" onClick={submit} disabled={pending} className="min-h-11 w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50">
          {pending ? 'Сохраняю…' : 'Добавить'}
        </button>
      }
    >
      <FormField label="Что">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Страховка авто, отпуск, налог…" className={formInputClass} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Сумма, ₸">
          <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={formInputClass} />
        </FormField>
        <FormField label="Срок — месяц">
          <select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)} className={formInputClass}>
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField label="Уже отложено, ₸ (необязательно)">
        <input type="number" inputMode="numeric" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" className={formInputClass} />
      </FormField>
    </FormSheet>
  )
}

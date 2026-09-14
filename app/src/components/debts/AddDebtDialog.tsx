import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, Loader2, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAddDebt, useUpdateDebt } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import { assistDebtDraft } from '@/lib/api'
import type { Debt, DebtDraft, DebtStatus } from '@/types/domain'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface FormState {
  title: string
  creditor: string
  principalAmount: string
  currentBalance: string
  interestRate: string
  minimumPayment: string
  dueDay: string
  status: DebtStatus
  notes: string
}

const EMPTY_FORM: FormState = {
  title: '',
  creditor: '',
  principalAmount: '',
  currentBalance: '',
  interestRate: '',
  minimumPayment: '',
  dueDay: '',
  status: 'active',
  notes: '',
}

/** Create or edit a debt (ТЗ §5 экран 2: "Добавление/редактирование долга"). Pass `debt` to edit. */
export function AddDebtDialog({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt?: Debt }) {
  const userId = useCurrentUserId()
  const addDebt = useAddDebt()
  const updateDebt = useUpdateDebt()
  const isEdit = Boolean(debt)
  const isPending = addDebt.isPending || updateDebt.isPending

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hint, setHint] = useState('')
  const [isAssisting, setIsAssisting] = useState(false)
  const [draftNote, setDraftNote] = useState<DebtDraft | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(
      debt
        ? {
            title: debt.title,
            creditor: debt.creditor,
            principalAmount: String(debt.principal_amount),
            currentBalance: String(debt.current_balance),
            interestRate: debt.interest_rate != null ? String(debt.interest_rate) : '',
            minimumPayment: String(debt.minimum_payment),
            dueDay: debt.due_day != null ? String(debt.due_day) : '',
            status: debt.status,
            notes: debt.notes ?? '',
          }
        : EMPTY_FORM,
    )
    setHint('')
    setDraftNote(null)
  }, [open, debt])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleAiAssist(file: File) {
    setIsAssisting(true)
    try {
      const imageBase64 = await fileToBase64(file)
      const draft = await assistDebtDraft({ imageBase64, mediaType: file.type || 'image/jpeg', textHint: hint.trim() || undefined })
      setForm((f) => ({
        title: draft.title || f.title,
        creditor: draft.creditor || f.creditor,
        principalAmount: draft.principal_amount != null ? String(draft.principal_amount) : f.principalAmount,
        currentBalance: draft.current_balance != null ? String(draft.current_balance) : f.currentBalance,
        interestRate: draft.interest_rate != null ? String(draft.interest_rate) : f.interestRate,
        minimumPayment: draft.minimum_payment != null ? String(draft.minimum_payment) : f.minimumPayment,
        dueDay: draft.due_day != null ? String(draft.due_day) : f.dueDay,
        status: f.status,
        notes: f.notes,
      }))
      setDraftNote(draft)
      toast.success('Черновик заполнен — проверьте данные перед сохранением')
    } catch {
      toast.error('Не удалось разобрать данные — заполните вручную')
    } finally {
      setIsAssisting(false)
    }
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.creditor.trim()) {
      toast.error('Укажите название и кредитора')
      return
    }
    const principal = Number(form.principalAmount)
    if (!principal || principal <= 0) {
      toast.error('Укажите сумму долга больше нуля')
      return
    }

    const payload = {
      title: form.title.trim(),
      creditor: form.creditor.trim(),
      principal_amount: principal,
      current_balance: form.currentBalance ? Number(form.currentBalance) : principal,
      currency: 'KZT',
      interest_rate: form.interestRate ? Number(form.interestRate) : null,
      minimum_payment: Number(form.minimumPayment) || 0,
      due_day: form.dueDay ? Number(form.dueDay) : null,
      status: form.status,
      notes: form.notes.trim() || null,
    }

    if (isEdit && debt) {
      await updateDebt.mutateAsync({ id: debt.id, patch: payload })
      toast.success('Долг обновлён')
    } else {
      await addDebt.mutateAsync({ ...payload, owner_user_id: userId, created_at: new Date().toISOString() })
      toast.success('Долг добавлен')
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать долг' : 'Новый долг'}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <div className="bg-muted/50 space-y-2 rounded-xl p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleAiAssist(file)
                e.target.value = ''
              }}
            />
            <div className="flex items-center gap-2">
              <Input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Уточнение для AI (необязательно), напр. «Kaspi Bank, потребительский»"
                className="h-9 flex-1 bg-background"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0"
                disabled={isAssisting}
                onClick={() => fileInputRef.current?.click()}
              >
                {isAssisting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isAssisting ? 'Разбираю...' : 'Скриншот → AI'}
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Загрузите скриншот кредита — AI заполнит поля ниже (при необходимости уточнит ставку в интернете). Запускается только по кнопке, ничего не сохраняет само.
            </p>
            {draftNote && (
              <div className="flex items-start gap-1.5 rounded-lg border border-status-yellow/40 bg-status-yellow/10 p-2 text-[11px]">
                {draftNote.used_web_search && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-status-yellow" />}
                <span>{draftNote.source_note}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-title">Название</Label>
            <Input id="debt-title" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Кредит на авто" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt-creditor">Кредитор</Label>
            <Input id="debt-creditor" value={form.creditor} onChange={(e) => update('creditor', e.target.value)} placeholder="Kaspi Bank" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-principal">Сумма долга, ₸</Label>
              <Input
                id="debt-principal"
                type="number"
                inputMode="decimal"
                value={form.principalAmount}
                onChange={(e) => update('principalAmount', e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-balance">Остаток, ₸</Label>
              <Input
                id="debt-balance"
                type="number"
                inputMode="decimal"
                value={form.currentBalance}
                onChange={(e) => update('currentBalance', e.target.value)}
                placeholder={form.principalAmount || '0'}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-rate">Ставка, % годовых</Label>
              <Input id="debt-rate" type="number" inputMode="decimal" value={form.interestRate} onChange={(e) => update('interestRate', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-min-payment">Мин. платёж, ₸</Label>
              <Input
                id="debt-min-payment"
                type="number"
                inputMode="decimal"
                value={form.minimumPayment}
                onChange={(e) => update('minimumPayment', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-due-day">День платежа</Label>
              <Input id="debt-due-day" type="number" min={1} max={31} value={form.dueDay} onChange={(e) => update('dueDay', e.target.value)} placeholder="5" />
            </div>
            {isEdit && (
              <div className="space-y-1.5">
                <Label>Статус</Label>
                <Select value={form.status} onValueChange={(v) => update('status', (v ?? 'active') as DebtStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(value: DebtStatus) => (value === 'active' ? 'Активен' : 'Закрыт')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Активен</SelectItem>
                    <SelectItem value="closed">Закрыт</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt-notes">Заметка (необязательно)</Label>
            <Input id="debt-notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Например, беспроцентная рассрочка" />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Добавить долг'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

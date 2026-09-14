import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseReceipt } from '@/lib/api'
import { useAddExpense, useCategories } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import type { ReceiptParseResult } from '@/types/domain'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Photo-of-receipt → AI parse → mandatory confirmation screen before saving,
 * per ТЗ §7.1/§13: recognition accuracy is never assumed, so nothing is
 * written to expenses without the user reviewing it first.
 */
export function ReceiptCaptureFlow({ autoOpen = false }: { autoOpen?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const userId = useCurrentUserId()
  const { data: categories } = useCategories()
  const addExpense = useAddExpense()

  const [status, setStatus] = useState<'idle' | 'parsing' | 'confirm'>('idle')
  const [result, setResult] = useState<ReceiptParseResult | null>(null)
  const [categoryId, setCategoryId] = useState<string>('')

  useEffect(() => {
    if (autoOpen) inputRef.current?.click()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(file: File) {
    setStatus('parsing')
    try {
      const base64 = await fileToBase64(file)
      const parsed = await parseReceipt(base64)
      if (!parsed.is_valid_receipt) {
        toast.error('Не похоже на чек — попробуйте другое фото')
        setStatus('idle')
        return
      }
      setResult(parsed)
      const matchedCategory = categories?.find((c) => c.name === parsed.suggested_category)
      setCategoryId(matchedCategory?.id ?? '')
      setStatus('confirm')
    } catch {
      toast.error('Не удалось распознать чек, попробуйте ещё раз')
      setStatus('idle')
    }
  }

  async function confirmSave() {
    if (!result) return
    await addExpense.mutateAsync({
      user_id: userId,
      amount: result.total_amount ?? 0,
      currency: result.currency ?? 'KZT',
      category_id: categoryId || null,
      merchant: result.merchant,
      spent_at: result.date ?? new Date().toISOString().slice(0, 10),
      description: null,
      source: 'receipt_photo',
      receipt_asset_path: null,
      ai_confidence: result.confidence,
      is_confirmed: true,
    })
    toast.success('Расход сохранён')
    setStatus('idle')
    setResult(null)
  }

  const expenseCategories = categories?.filter((c) => c.type === 'expense') ?? []
  const lowConfidence = (result?.confidence ?? 1) < 0.6

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <Button variant="outline" className="h-auto flex-col gap-1.5 rounded-2xl py-3" onClick={() => inputRef.current?.click()}>
        <Camera className="h-4 w-4" />
        <span className="text-xs">Фото чека</span>
      </Button>

      <Dialog open={status === 'parsing'}>
        <DialogContent className="max-w-xs" showCloseButton={false}>
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="text-primary h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-sm">AI разбирает чек...</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={status === 'confirm'} onOpenChange={(open) => !open && setStatus('idle')}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Проверьте перед сохранением</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              {lowConfidence && (
                <p className="bg-status-yellow/15 text-status-yellow rounded-lg px-3 py-2 text-xs">
                  Низкая уверенность распознавания — внимательно проверьте сумму и магазина.
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Магазин</Label>
                <Input value={result.merchant ?? ''} onChange={(e) => setResult({ ...result, merchant: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Сумма, {result.currency}</Label>
                <Input
                  type="number"
                  value={result.total_amount ?? 0}
                  onChange={(e) => setResult({ ...result, total_amount: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Категория</Label>
                <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выбрать категорию">
                      {(value: string | null) => (value ? expenseCategories.find((c) => c.id === value)?.name : null) ?? 'Выбрать категорию'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {result.line_items.length > 0 && (
                <div className="space-y-1 rounded-lg border border-border p-2.5">
                  {result.line_items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground truncate">{item.name}</span>
                      <span>{item.amount.toLocaleString('ru-RU')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={confirmSave} disabled={addExpense.isPending} className="w-full">
              {addExpense.isPending ? 'Сохранение...' : 'Сохранить расход'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

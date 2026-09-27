// Service-role jobs (summaries, reminders) see every family at once, so they
// work family by family: each gets its own numbers and only its own members
// get the message.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface HouseholdMembers {
  id: string
  telegramIds: number[]
}

export async function listHouseholds(admin: SupabaseLike): Promise<HouseholdMembers[]> {
  const { data: users } = await admin.from('users').select('household_id, telegram_id')
  const byHousehold = new Map<string, number[]>()
  for (const u of (users ?? []) as Array<{ household_id: string; telegram_id: number }>) {
    byHousehold.set(u.household_id, [...(byHousehold.get(u.household_id) ?? []), u.telegram_id])
  }
  return [...byHousehold.entries()].map(([id, telegramIds]) => ({ id, telegramIds }))
}

// Предпочтения на этом устройстве (localStorage); без хранилища всё работает по умолчанию.

const PREF_KEY = 'hf.checkBeforeDebt'

/** «Сначала проверить» включено по умолчанию; выбор запоминается на этом устройстве. */
export function readCheckFirst(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeCheckFirst(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0')
  } catch {
    // без хранилища переключатель просто не запоминается
  }
}

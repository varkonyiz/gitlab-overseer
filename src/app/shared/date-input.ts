/**
 * The value of an `ix-date-input` change, or null to ignore it. The component emits an empty
 * `valueChange` while it initialises, which would wipe a bound value; an empty value only counts
 * while the user is editing the field.
 */
export function dateInputValue(event: Event): string | null {
  const value = (event as CustomEvent<string | undefined>).detail ?? '';
  if (value === '' && !(event.target as Element | null)?.matches(':focus-within')) {
    return null;
  }
  return value;
}

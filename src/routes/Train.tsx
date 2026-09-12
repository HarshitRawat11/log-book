import { EmptyState } from '../components/EmptyState'
import { Screen } from '../components/Screen'

export function Train() {
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <Screen title="Train" subtitle={today}>
      <EmptyState
        title="No session yet"
        body="Phase 2 puts workout logging here: today's exercises, last session's numbers inline, and a sticky log button."
      />
    </Screen>
  )
}

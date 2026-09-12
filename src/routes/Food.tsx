import { EmptyState } from '../components/EmptyState'
import { Screen } from '../components/Screen'

export function Food() {
  return (
    <Screen title="Food" subtitle="Today">
      <EmptyState
        title="Nothing logged today"
        body="Phase 3 puts meals here: your saved foods and recipes first, with 7-day averages alongside the daily numbers."
      />
    </Screen>
  )
}

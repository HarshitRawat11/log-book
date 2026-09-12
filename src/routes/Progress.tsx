import { EmptyState } from '../components/EmptyState'
import { Screen } from '../components/Screen'

export function Progress() {
  return (
    <Screen title="Progress">
      <EmptyState
        title="No data to chart"
        body="Phase 4 puts charts here: estimated 1RM per exercise, session tonnage, weekly working sets, and bodyweight with a 7-day average."
      />
    </Screen>
  )
}

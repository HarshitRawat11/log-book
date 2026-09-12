import { Screen } from '../components/Screen'
import { useAuth } from '../auth/AuthProvider'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
      <span className="text-sm text-text-dim">{label}</span>
      <span className="truncate text-sm">{value}</span>
    </div>
  )
}

export function Settings() {
  const { session, signOut } = useAuth()

  return (
    <Screen title="Settings">
      <section className="rounded-2xl border border-border bg-surface">
        <Row label="Signed in as" value={session?.user.email ?? '—'} />
        <Row label="Units" value="Kilograms and grams" />
        <Row label="Region" value="ap-south-1 (Mumbai)" />
      </section>

      <p className="mt-4 px-1 text-sm text-text-dim">
        Diet targets, the BMR calculator and data export arrive in later phases.
      </p>

      <button
        onClick={() => void signOut()}
        className="mt-6 min-h-14 w-full rounded-xl border border-border bg-surface
                   px-4 font-semibold text-danger"
      >
        Sign out
      </button>
    </Screen>
  )
}

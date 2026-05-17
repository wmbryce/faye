import { Button } from "@/components/ui/button";

const PLACEHOLDER = `{
  "geo": { "countries": ["US", "CA"] },
  "age_min": 18,
  "age_max": 44,
  "interests": ["indie folk", "americana"]
}`;

export function AudienceSeedForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <label className="block">
        <span className="text-sm">Name</span>
        <input name="name" required className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background" />
      </label>
      <label className="block">
        <span className="text-sm">Targeting spec (JSON)</span>
        <textarea
          name="targetingSpec"
          required
          rows={12}
          defaultValue={PLACEHOLDER}
          className="mt-1 w-full px-3 py-2 font-mono text-sm border border-border rounded-md bg-background"
        />
      </label>
      <Button type="submit">Add seed</Button>
    </form>
  );
}

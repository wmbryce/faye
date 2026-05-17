import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PLACEHOLDER = `{
  "geo": { "countries": ["US", "CA"] },
  "age_min": 18,
  "age_max": 44,
  "interests": ["indie folk", "americana"]
}`;

export function AudienceSeedForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <Field label="Name" htmlFor="name" hint="Short label you'll recognize in dashboards.">
        <Input id="name" name="name" required placeholder="indie folk US 25-44" />
      </Field>
      <Field
        label="Targeting spec (JSON)"
        htmlFor="targetingSpec"
        hint="Validated by Zod. geo.countries (ISO-2) required; age_min/age_max/interests/lookalikes/languages optional."
      >
        <Textarea
          id="targetingSpec"
          name="targetingSpec"
          required
          rows={14}
          defaultValue={PLACEHOLDER}
          className="font-mono text-sm"
        />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit">Add seed</Button>
      </div>
    </form>
  );
}

import { brand } from "@/config/brand";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const steps = [
  { title: "Sign up free", body: "Create an account and verify your email." },
  { title: "Register for a tournament", body: "Sit & Go tables start as soon as they fill; scheduled tournaments start on time." },
  { title: "Play to the final table", body: "Everyone starts with the same stack. Last player standing wins." },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-5 py-6">
        <h1 className="text-[40px] font-semibold leading-tight sm:text-[56px]">{brand.name}</h1>
        <p className="max-w-2xl text-[19px] text-ink-2">{brand.description}</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/contests" size="lg">See tournaments</ButtonLink>
          <ButtonLink href="/signup" size="lg" variant="outline">Create account</ButtonLink>
        </div>
      </section>
      <section aria-labelledby="how" className="flex flex-col gap-5">
        <h2 id="how" className="text-[28px] font-medium">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card className="flex h-full flex-col gap-2 p-6">
                <span className="font-mono text-sm text-accent">Step {i + 1}</span>
                <h3 className="text-[20px] font-medium">{s.title}</h3>
                <p className="text-ink-2">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

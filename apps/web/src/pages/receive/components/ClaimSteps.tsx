interface ClaimStepsProps {
  steps: Array<{ title: string; detail: string }>;
}

export function ClaimSteps({ steps }: ClaimStepsProps): JSX.Element {
  return (
    <ol className="space-y-6">
      {steps.map((step, index) => (
        <li key={step.title} className="rounded-3xl border border-accent/30 bg-panel/30 p-6 shadow-lg shadow-accent/10">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-lg font-semibold text-accent-foreground">
              {index + 1}
            </span>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-accent-foreground">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

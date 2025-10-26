import policyContent from '../../content/privacy-policy.json';
import { MarketingLayout } from '../../layouts/MarketingLayout';

interface PolicySection {
  heading: string;
  body: string;
}

export function PrivacyPolicyPage(): JSX.Element {
  const { title, sections } = policyContent as { title: string; sections: PolicySection[] };

  return (
    <MarketingLayout title={title} description="個人情報の取り扱いに関する指針をまとめています。">
      <section className="grid gap-6">
        {sections.map((section) => (
          <article key={section.heading} className="space-y-2 rounded-3xl border border-border/40 bg-panel/30 p-6">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </article>
        ))}
      </section>
    </MarketingLayout>
  );
}

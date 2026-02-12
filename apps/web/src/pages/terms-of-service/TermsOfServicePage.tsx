import { termsOfServiceContent } from '../../content/termsOfService';

export function TermsOfServicePage(): JSX.Element {
  return (
    <article className="terms-of-service-page mx-auto w-full max-w-4xl px-6 py-12 text-foreground sm:py-16">
      <header className="terms-of-service-page__header mb-8 border-b border-border pb-6">
        <span className="terms-of-service-page__label inline-flex rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Legal
        </span>
        <h1 className="terms-of-service-page__title mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          {termsOfServiceContent.title}
        </h1>
        <p className="terms-of-service-page__lead mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          {termsOfServiceContent.lead}
        </p>
        <div className="terms-of-service-page__meta mt-4 space-y-1 text-xs text-muted-foreground sm:text-sm">
          <p className="terms-of-service-page__effective-date">{termsOfServiceContent.effectiveDateLabel}</p>
          <p className="terms-of-service-page__last-updated">{termsOfServiceContent.lastUpdatedLabel}</p>
        </div>
      </header>

      <div className="terms-of-service-page__sections space-y-8">
        {termsOfServiceContent.sections.map((section) => (
          <section key={section.id} className="terms-section space-y-4" aria-labelledby={`terms-section-title-${section.id}`}>
            <h2 id={`terms-section-title-${section.id}`} className="terms-section__title text-xl font-semibold">
              {section.title}
            </h2>
            <div className="terms-section__body space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${section.id}-paragraph-${paragraphIndex}`} className="terms-section__paragraph">
                  {paragraph}
                </p>
              ))}
            </div>
            {section.bullets && section.bullets.length > 0 && (
              <ul className="terms-section__list list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.bullets.map((item, bulletIndex) => (
                  <li key={`${section.id}-bullet-${bulletIndex}`} className="terms-section__list-item">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="terms-of-service-page__footer mt-10 border-t border-border pt-6 text-sm leading-7 text-muted-foreground sm:text-base">
        <h2 className="terms-of-service-page__contact-title text-lg font-semibold text-foreground">お問い合わせ</h2>
        <p className="terms-of-service-page__contact-note mt-2">{termsOfServiceContent.contactNote}</p>
        <p className="terms-of-service-page__contact-email mt-1">{termsOfServiceContent.contactEmail}</p>
      </footer>
    </article>
  );
}

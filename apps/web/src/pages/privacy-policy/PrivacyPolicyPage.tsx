import { privacyPolicyContent } from '../../content/privacyPolicy';

export function PrivacyPolicyPage(): JSX.Element {
  return (
    <article className="privacy-policy-page mx-auto w-full max-w-4xl px-6 py-12 text-foreground sm:py-16">
      <header className="privacy-policy-page__header mb-8 border-b border-border pb-6">
        <h1 className="privacy-policy-page__title mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          {privacyPolicyContent.title}
        </h1>
        <p className="privacy-policy-page__lead mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          {privacyPolicyContent.lead}
        </p>
        <div className="privacy-policy-page__meta mt-4 space-y-1 text-xs text-muted-foreground sm:text-sm">
          <p className="privacy-policy-page__operator-name">運営者: {privacyPolicyContent.operatorName}</p>
          <p className="privacy-policy-page__effective-date">{privacyPolicyContent.effectiveDateLabel}</p>
          <p className="privacy-policy-page__last-updated">{privacyPolicyContent.lastUpdatedLabel}</p>
        </div>
      </header>

      <div className="privacy-policy-page__sections space-y-8">
        {privacyPolicyContent.sections.map((section) => (
          <section
            key={section.id}
            className="privacy-section space-y-4"
            aria-labelledby={`privacy-section-title-${section.id}`}
          >
            <h2 id={`privacy-section-title-${section.id}`} className="privacy-section__title text-xl font-semibold">
              {section.title}
            </h2>
            <div className="privacy-section__body space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${section.id}-paragraph-${paragraphIndex}`} className="privacy-section__paragraph">
                  {paragraph}
                </p>
              ))}
            </div>
            {section.bullets && section.bullets.length > 0 && (
              <ul className="privacy-section__list list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.bullets.map((item, bulletIndex) => (
                  <li key={`${section.id}-bullet-${bulletIndex}`} className="privacy-section__list-item">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="privacy-policy-page__footer mt-10 border-t border-border pt-6 text-sm leading-7 text-muted-foreground sm:text-base">
        <h2 className="privacy-policy-page__contact-title text-lg font-semibold text-foreground">お問い合わせ</h2>
        <p className="privacy-policy-page__contact-note mt-2">{privacyPolicyContent.contactNote}</p>
        <p className="privacy-policy-page__contact-method mt-1">{privacyPolicyContent.contactMethodLabel}</p>
      </footer>
    </article>
  );
}

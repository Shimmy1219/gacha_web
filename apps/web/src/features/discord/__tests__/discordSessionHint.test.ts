import {
  DISCORD_SESSION_HINT_COOKIE_NAME,
  clearDiscordSessionHintCookieClientSide,
  hasDiscordSessionHintCookie
} from '../discordSessionHint';

describe('discordSessionHint', () => {
  const mutableGlobal = globalThis as unknown as {
    document?: { cookie: string };
    window?: { location: { protocol: string } };
  };
  const originalDocument = mutableGlobal.document;
  const originalWindow = mutableGlobal.window;

  afterEach(() => {
    if (typeof originalDocument === 'undefined') {
      delete mutableGlobal.document;
    } else {
      mutableGlobal.document = originalDocument;
    }

    if (typeof originalWindow === 'undefined') {
      delete mutableGlobal.window;
    } else {
      mutableGlobal.window = originalWindow;
    }
  });

  it('returns false when document is not available', () => {
    delete mutableGlobal.document;
    expect(hasDiscordSessionHintCookie()).toBe(false);
  });

  it('returns true when session hint cookie exists', () => {
    mutableGlobal.document = {
      cookie: `foo=bar; ${DISCORD_SESSION_HINT_COOKIE_NAME}=1; hello=world`
    };
    expect(hasDiscordSessionHintCookie()).toBe(true);
  });

  it('returns false for empty or disabled hint values', () => {
    mutableGlobal.document = {
      cookie: `${DISCORD_SESSION_HINT_COOKIE_NAME}=false`
    };
    expect(hasDiscordSessionHintCookie()).toBe(false);

    mutableGlobal.document = {
      cookie: `${DISCORD_SESSION_HINT_COOKIE_NAME}=0`
    };
    expect(hasDiscordSessionHintCookie()).toBe(false);
  });

  it('clears hint cookie with secure attribute on https', () => {
    mutableGlobal.document = { cookie: `${DISCORD_SESSION_HINT_COOKIE_NAME}=1` };
    mutableGlobal.window = { location: { protocol: 'https:' } };

    clearDiscordSessionHintCookieClientSide();

    expect(mutableGlobal.document.cookie).toContain(`${DISCORD_SESSION_HINT_COOKIE_NAME}=`);
    expect(mutableGlobal.document.cookie).toContain('Max-Age=0');
    expect(mutableGlobal.document.cookie).toContain('Secure');
  });
});

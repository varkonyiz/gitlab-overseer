import { base64Url, codeChallengeS256, createCodeVerifier, createState, safeEqual } from './pkce';

describe('pkce', () => {
  it('createCodeVerifier_Default_IsUrlSafeAndLongEnough', () => {
    const verifier = createCodeVerifier();

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(createCodeVerifier()).not.toBe(verifier);
  });

  it('createState_Default_IsRandom', () => {
    expect(createState()).not.toBe(createState());
  });

  it('codeChallengeS256_Rfc7636Example_MatchesSpec', async () => {
    // RFC 7636, Appendix B.
    const challenge = await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');

    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('base64Url_BytesNeedingPadding_HasNoPaddingOrUnsafeChars', () => {
    expect(base64Url(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('safeEqual_DifferentStrings_False', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
});

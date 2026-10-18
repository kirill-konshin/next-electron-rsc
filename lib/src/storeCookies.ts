import type { CookiesSetDetails, Session } from 'electron';
import { parse as parseCookie, splitCookiesString } from 'set-cookie-parser';

function toElectronSameSite(sameSite?: string): CookiesSetDetails['sameSite'] {
    switch (sameSite?.toLowerCase()) {
        case 'none':
            return 'no_restriction';
        case 'lax':
            return 'lax';
        case 'strict':
            return 'strict';
        default:
            return undefined;
    }
}

/** Mirrors a browser cookie jar: `Set-Cookie` from a response goes into the Electron session. */
export async function storeCookies(session: Session, url: string, response: Response): Promise<void> {
    try {
        // @see https://github.com/electron/electron/issues/30717
        // @see https://github.com/electron/electron/issues/39525
        const cookies = parseCookie(
            response.headers.getSetCookie().reduce<string[]>((r, c) => {
                // @see https://github.com/nfriedly/set-cookie-parser?tab=readme-ov-file#usage-in-react-native-and-with-some-other-fetch-implementations
                return [...r, ...splitCookiesString(c)];
            }, []),
            // Stored as sent, see `createRequest`
            { decodeValues: false },
        );

        for (const cookie of cookies) {
            const { name, value, path, domain, secure, httpOnly, expires, maxAge, sameSite } = cookie;

            // Max-Age wins over Expires (RFC 6265 5.3), and `Max-Age=0` deletes, so 0 is not "absent".
            const expiresAtMs = maxAge !== undefined ? Date.now() + maxAge * 1000 : expires?.getTime();

            if (expiresAtMs !== undefined && expiresAtMs <= Date.now()) {
                await session.cookies.remove(url, cookie.name);
                continue;
            }

            await session.cookies.set({
                url,
                // Electron takes seconds since the UNIX epoch; undefined keeps it a session cookie.
                expirationDate: expiresAtMs === undefined ? undefined : expiresAtMs / 1000,
                name,
                value,
                path,
                domain,
                secure,
                httpOnly,
                sameSite: toElectronSameSite(sameSite),
            });
        }
    } catch (e) {
        throw new Error('Failed to set cookies', { cause: e });
    }
}

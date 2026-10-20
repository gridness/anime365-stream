# Anime365 API facts

Checked 2026-10-20 for the IINA plugin design interview. Research used public first-party documentation and unauthenticated GET requests. No account, application, token, playback session, or remote content was created.

## Published contract

The [official documentation page](https://smotret-anime.org/api-docs) loads an [OpenAPI 3.0.3 document](https://smotret-anime.org/api/openapi.yaml?v=1786984811), API version `1.0`.

The OpenAPI document states:

- Catalog, episode, and translation metadata are public.
- Protected requests use an `access_token` query parameter. The registered `app` identifier is public; the user token is secret.
- `GET /api/login` exchanges `app`, email, and password for a token. `GET /api/accessToken?app=...` uses an existing website session, including social login.
- Tokens have no expiry and remain valid until a password change.
- `GET /api/translations/embed/{id}` requires an active subscription and returns playback/download information, including `subtitlesUrl`. Most subtitles are external ASS files. The similarly named route without `/api` is an HTML player.
- Embed responses have an arbitrary-object schema. Quality choices, stream URL lifetime, CDN hosts, and required playback headers are unspecified.
- List pagination defaults to 50, with a stated maximum of 1000. Large scans should use `afterId` rather than `offset`.
- Clients should identify their application in `User-Agent`.

No OAuth authorization flow, scopes, refresh/revoke endpoint, watch-progress/list endpoint, or request-rate limit appears in that document. Absence from the contract does not establish absence from the service.

## Observed behavior

The public [API client page](https://smotret-anime.org/api-clients) says registration requires website login. The OpenAPI-linked [/api/clients](https://smotret-anime.org/api/clients) displayed the same page. Registration fields and approval requirements remain unverified.

[The website login page](https://smotret-anime.org/users/login) offers email/password, VK, Google, and Shikimori. The client-registration page links to this plain login URL.

A guest request to `/api/accessToken?app=anime365-stream-unregistered-research`, with a browser-style `Accept` header, returned HTTP 200 and `application/json`, containing `error.code: 403` and `Authorization required.`. It did not redirect. The probe used a deliberately unregistered app identifier and no session. Behavior with a real registered identifier or after login was not exercised. The documented successful response is JSON containing `data.access_token`.

[Unauthenticated `/api/me`](https://smotret-anime.org/api/me) returned `isLogined: false`, `id: 0`, and `isPremium: false`. This verifies guest behavior only.

[Title search](https://smotret-anime.org/api/series?query=gate&limit=1) returned one series. [Series detail](https://smotret-anime.org/api/series/914?fields=id,titles,episodes) returned an `episodes` array containing a preview as well as episodes. [Episode listing](https://smotret-anime.org/api/episodes?seriesId=914&limit=1) included an inactive episode numbered zero. Do not assume every returned episode is available or a regular TV episode.

[Episode detail](https://smotret-anime.org/api/episodes/41137?fields=id,episodeInt,episodeType,translations) returned a `translations` array with separate IDs, language/kind, authors, `qualityType`, and dimensions. An observed translation had `qualityType: "bd"`, `width: 1920`, and `height: 1080`. Another had `qualityType: "tv"`. Keep release-source classification separate from playback resolution.

The same response contained website `url` and `embedUrl` values on `smotret-anime.co`, although the request went to `.org`. Returned website links do not establish the list of actual media hosts.

[Unauthenticated embed resolution](https://smotret-anime.org/api/translations/embed/6028447) returned HTTP **200** with `{"error":{"code":403,"message":"You should login first."}}`. The client must inspect the JSON error envelope even after an HTTP success. The OpenAPI response table alone would miss this case.

## Design implications and remaining checks

These are recommendations inferred from the evidence, not recorded product decisions:

- For a public plugin, the maintainer can register one app identifier and embed it in the plugin. The published contract does not say every end user must register a separate app.
- The token-import alternative can open website login, then open `/api/accessToken?app=<registered-plugin-app>` in the same browser, then ask the user to paste the returned token into the plugin. Automatic login redirects, callbacks, clipboard extraction, and browser-session sharing remain unverified.
- Resolve an authenticated translation when playback starts. Persist series, episode, and translation IDs rather than assuming media URLs remain valid.
- Treat active subscription as a separate requirement from successful authentication.
- Keep watch progress local unless a supported remote API is established.

A subscribed-account runtime check is still needed for URL expiry, redirects, subtitle hosts, request headers, and direct IINA playback. A later user report below confirms one authenticated payload's structure, available resolution entries, and media hosts. Also verify what changing the password invalidates and whether the service offers application-specific revocation outside its published API.

## Vocabulary candidates

These are terms to resolve in the root glossary, not a separate bounded context:

- `Series` represents a catalog anime entry, called "Аниме" in the official API. Avoid assuming it is an entire franchise or a numbered season.
- `Episode` represents an item belonging to a series. The [observed series detail](https://smotret-anime.org/api/series/914?fields=id,titles,episodes) includes `episodeType: "preview"`; regular episode numbers alone are insufficient identifiers.
- `Translation` identifies an episode-specific release variant, with its own ID, authors, kind/language, and source classification. [Observed episode data](https://smotret-anime.org/api/episodes/41137?fields=id,episodeInt,episodeType,translations) includes dubbed, subtitled, and raw variants. It is more specific than a language choice.
- `Playback resolution` should remain distinct from translation `qualityType`, whose observed values include `tv` and `bd`.

The sources establish neither a fixed media URL lifetime nor a stable-URL guarantee. The recommendation to resolve at playback time must not be described as a confirmed expiry rule.

## Follow-up for password login and remembered translations

The [official OpenAPI contract](https://smotret-anime.org/api/openapi.yaml?v=1786984811) documents only **GET** for `/api/login`. Its required `app`, `email`, and `password` parameters are all in the query string. POST acceptance is unverified. The public website form uses POST to `/users/login` with CSRF and form fields, which is a separate session-based interface.

Consequently, implementing password login requires auditing URL handling and logs. Use HTTPS host requests and redact `email`, `password`, and `access_token` from diagnostics and request errors. Do not open credential-bearing login URLs in a browser. Keychain availability and storage behavior depend on IINA and are outside these API findings.

The documented login failure is 403 for either an unknown app or incorrect email/password, without a separate machine-readable reason. The contract gives no CAPTCHA, two-factor, email-verification, or social-only-account behavior. The browser token alternative remains available for social login; successful behavior for those accounts was not tested. No `/api/login` requests or credential submissions were made.

The documented `/me` fields are `isLogined`, `id`, `name`, `isPremium`, and `premiumUntil`; no email field is documented. Authentication and subscription status should therefore be checked separately.

The [public translation query](https://smotret-anime.org/api/translations?seriesId=914&episodeId=41181&fields=id,seriesId,episodeId,type,typeKind,typeLang,authorsList,authorsSummary,qualityType,priority,isActive&limit=1000) accepted both series and episode filters. It returned 40 episode-12 translations, with the requested fields. Comparing [episode 11](https://smotret-anime.org/api/episodes/41137?fields=id,episodeInt,episodeType,translations) found the same `voiceRu` / `AniLibria` / `bd` choice under different translation IDs, `4823200` and `4823194`. Remember a preference based on the translation metadata for a series, then match that preference against the next episode's translations. A translation ID belongs to one episode. `authorsList` contains names, and no stable author identifier is documented. Renames, absent variants, and ambiguous matches still need a product fallback rule. `priority` is present, but its selection semantics are undocumented.

[Series episode data](https://smotret-anime.org/api/series/914?fields=id,titles,episodes) supplies `episodeType`, numeric `episodeInt`, and display label `episodeFull`. The same number can occur under different types, as preview 1 and TV episode 1 do in this sample. The contract permits a numeric, rather than integer-only, `episodeInt` and documents no next-episode pointer or cross-type playback order. Autoplay must define its own ordering and availability rules; sorting display labels is insufficient.

## Published playback contract and public player evidence

The OpenAPI success schema for `/translations/embed/{id}` is `GenericObjectResponse`: `data` is an object with unrestricted additional properties. It provides no successful payload example, source-array key, resolution schema, or media-host list. `subtitlesUrl` appears in the operation description, without a complete typed response.

Public first-party [embed-page JavaScript](https://smotret-anime.org/js/app/embed.min.js?1785943069) initializes a video element rendered by the server. Its [concatenation library](https://smotret-anime.org/js/lib/videojs.concatenate.min.js?1789631056) reads HTML `data-sources` and `data-audio`; its [subtitle library](https://smotret-anime.org/js/lib/videojs.subtitles.min.js?1787145769) reads HTML `data-subtitles`. These are website DOM interfaces. Inspection established no documented mapping between them and `/api/translations/embed/{id}`. Media-host evidence subsequently found in public page configuration is recorded below.

Do not invent an authenticated response decoder from website attributes or third-party wrappers. The later user-confirmed report below supplies limited authenticated shape evidence. No token or credential requests were made during this public-source follow-up.

## Website search differs from API title filtering

Checked live against public first-party responses on 2026-10-20. The [website search form](https://smotret-anime.org/catalog/search) submits **GET `/catalog/search?q=<term>`**. Its normal results are server-rendered HTML. The [public main script](https://smotret-anime.org/js/app/main.min.js?1785943069) establishes no separate JSON search service; inline result-page configuration uses Yii `yiiListViewMod` on the same route.

The documented API `query` parameter is functional, but its result order and matching differ from website search. These first IDs were observed with no credentials:

| Query | `/api/series?query=...&limit=30&offset=0` | `/catalog/search?q=...` |
| --- | --- | --- |
| [Naruto](https://smotret-anime.org/catalog/search?q=Naruto) | `30887, 4530, 2440, 8069, 1395` | `2440, 254, 4530, 5549, 848` |
| [Наруто](https://smotret-anime.org/catalog/search?q=%D0%9D%D0%B0%D1%80%D1%83%D1%82%D0%BE) | `30887, 4530, 2440, 8069, 1395` | `33193, 2440, 254, 30887, 4530` |
| [Sousou no Frieren](https://smotret-anime.org/catalog/search?q=Sousou%20no%20Frieren) | `30414, 37673, 35064, 42431` | `30414, 42431, 37673, 35064, 21082` |
| [Фрирен](https://smotret-anime.org/catalog/search?q=%D0%A4%D1%80%D0%B8%D1%80%D0%B5%D0%BD) | `30414, 37673, 35064, 42431` | `30414, 42431, 37673, 35064, 33472` |

The [exact current-plugin API request for Naruto](https://smotret-anime.org/api/series?query=Naruto&limit=30&offset=0) confirmed the same API ID order as a reduced-field request. The Frieren API queries returned four entries; website search supplied additional suggestions. This establishes different behavior, without establishing either server's ranking algorithm. To reproduce the website search, preserve its response order rather than adding client-side ranking or changing `query` to an undocumented API parameter.

Result markup uses `#yw0 .card.m-catalog-item`. Within each card, `h2.line-1 a` holds the main title and `h3.line-2 a` holds a secondary, usually romanized title. Exclude each nested `.online-h` span from title text. Both links use `/catalog/<slug>-<seriesId>`. Hidden `#yw0 .keys span` values provide the same ordered numeric IDs. The inspected cards expose no explicit year or anime-type field. No bulk lookup by Anime365 IDs is documented, and no undocumented bulk request was attempted. Card summaries can therefore use website text, with API details requested only after selection.

Pagination uses the same `q` and **one-based `page`**, with the first page omitted. `.load-more` links contain `page=2` but `data-page="1"`; the latter is zero-based. `#yw0[data-total]` was `2` for the Russian Frieren search: page one had 30 cards, page two had three and no next link. It represents page count in these responses, not series count. Preserve query text and derive continuation from the site's next link.

An actual [empty search](https://smotret-anime.org/catalog/search?q=%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A%D1%8A) returns HTTP 200, the search form, a `.card .m-page-title` results heading, and an explicit no-results sentence. It has **no `#yw0`**. A missing list alone must not be treated as an empty search.

Search can redirect. A [MyAnimeList URL query](https://smotret-anime.org/catalog/search?q=https%3A%2F%2Fmyanimelist.net%2Fanime%2F9253) returned 302 to `/catalog/914`, then the canonical `/catalog/steins-gate-914`. The resulting document's canonical and `og:url` links use `https://smotret-anime.co/catalog/steins-gate-914`. That page also has `#yw0`, but it is a comments list, not search results. Resolve a validated canonical series page before considering search markup. Bare `q=914` returned title-search results rather than selecting series 914; a pasted Anime365 page URL produced search results rather than this redirect. Do not assign numeric queries or every URL an undocumented direct-ID meaning.

The fixture captures below retain all ordered card headings, IDs, links, and pagination. They omit surrounding layout, scripts, CSS, poster images, descriptions, ratings, and genres. Source characters requiring the project's Russian spelling convention are represented with HTML numeric references, preserving decoded title text.

| Fixture | Source query and page | Observed result |
| --- | --- | --- |
| `tests/fixtures/search-naruto-page1.html` | `q=Naruto`, first page | 28 cards, one page |
| `tests/fixtures/search-frieren-page1.html` | `q=Фрирен`, first page | 30 cards, `data-total="2"`, next page 2 |
| `tests/fixtures/search-frieren-page2.html` | `q=Фрирен&page=2` | 3 cards, no next page |
| `tests/fixtures/search-empty.html` | `q=ъъъъъъъъъъъъъ`, first page | HTTP 200, explicit no-results card, no list |

Each fixture includes its source URL and capture date. A prior candidate `qzxwpkjv` redirected to a series page; its empty comments list was rejected as an empty-search fixture.

## User-confirmed playback response and multipart caution

On 2026-10-20, the user supplied a safe structural report from an authenticated embed request. This evidence comes from the user's test, not an authenticated request by the research agent:

```text
embedUrl: string, host smotret-anime.co
download: [{ url: string, height: number }]
stream: [{ urls: [string], height: number }]
stream entries: 3
urls per entry in this sample: 1
subtitlesUrl: null
observed media hosts:
  ru-534543.quantum-phantom-moon.ru
  ru-684836.quantum-phantom-moon.ru
```

No credentials or signed media URLs were requested, received, or saved for this research. This sample establishes the listed fields and types for one response; it does not establish a complete schema, URL lifetime, or every translation variant.

The first-party [concatenation library](https://smotret-anime.org/js/lib/videojs.concatenate.min.js?1789631056) accepts resolution objects containing `height` and a `urls` array of strings, matching the reported stream-entry shape. `determineVideoSource` wraps each string as a source object. `determineVideosDuration` measures each source's duration, and `updateSummaryDuration` assigns cumulative start/end offsets. `checkCurrentVideo` switches to the source whose interval contains the logical playback position; `_videoEnd` emits final completion only after the last source. The website therefore treats this `urls` list as ordered media parts, with alternative copies handled separately through `alternativeSources`. The OpenAPI document still gives no explicit guarantee mapping API `stream` to this website structure.

The conservative implementation recommendation is to support entries with exactly one URL initially and report multipart entries as unsupported. Taking only the first item or treating every item as a replica risks playing an incomplete episode. Complete multipart support would need to preserve one logical episode timeline for seeking, subtitles, resume, and completion across parts.

The public [search page](https://smotret-anime.org/catalog/search) independently includes `ru-563564.quantum-phantom-moon.ru` in `site.realIpUrls`, a diagnostic URL configuration. That corroborates first-party use of the CDN root. The user's authenticated report establishes the two actual media hosts above; the public diagnostic configuration alone does not establish media playback or authorization behavior.

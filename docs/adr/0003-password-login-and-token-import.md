# Support password login and token import

Email and password are the preferred sign-in method for v1, with browser sign-in and manual token import as an alternative. Both paths use Anime365's official API. Remembering a sign-in saves only the resulting access token in macOS Keychain; the plugin does not retain the password.

IINA 1.5.0 exposes Keychain read and write operations without biometric access controls, so v1 cannot promise plugin-controlled Touch ID through those APIs. See the [host research](../research/iina-1.5.0.md) and [Anime365 authentication research](../research/anime365-api.md).

The sign-in form will mask passwords, allow paste and password managers, and submit the password unchanged, following ASVS 6.2.6, 6.2.7, and 6.2.8. Password creation, password policy, and account recovery remain with Anime365.

Signing out stops the Anime365 player and forgets the saved token while retaining the account's local viewing history. This ends the plugin's local session; it does not promise to revoke the token at Anime365, whose published API has no documented revocation endpoint.

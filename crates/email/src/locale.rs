//! User-facing language for outbound email templates.
//!
//! Kept minimal and additive: callers default to English when the requested
//! locale is unknown rather than failing, so a stale or misconfigured user
//! preference never blocks a transactional email.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Locale {
    En,
    De,
}

impl Locale {
    /// Parse `"en"` / `"de"` (case-insensitive). Falls back to [`Locale::En`]
    /// for anything else.
    #[must_use]
    pub const fn from_str_or_en(s: &str) -> Self {
        if s.as_bytes().eq_ignore_ascii_case(b"de") { Self::De } else { Self::En }
    }

    /// The two-letter language code used as the FE route prefix (`/en`, `/de`).
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::De => "de",
        }
    }

    /// Build a locale-prefixed absolute link for an email body.
    ///
    /// Every FE route is locale-prefixed (`/en/...`, `/de/...`), so an email
    /// link must carry the recipient's locale to land directly on the
    /// correctly-localised page — without it the FE would have to redirect,
    /// and a no-JS client / scraper would never reach the right language.
    /// `base` is the web app's public origin; `path` is the locale-agnostic
    /// path beginning with `/` (e.g. `/auth/consume?token=…`).
    #[must_use]
    pub fn link(self, base: &str, path: &str) -> String {
        format!("{}/{}{}", base.trim_end_matches('/'), self.as_str(), path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_de_case_insensitively() {
        assert_eq!(Locale::from_str_or_en("de"), Locale::De);
        assert_eq!(Locale::from_str_or_en("DE"), Locale::De);
        assert_eq!(Locale::from_str_or_en("De"), Locale::De);
    }

    #[test]
    fn defaults_to_en_for_unknown() {
        assert_eq!(Locale::from_str_or_en("en"), Locale::En);
        assert_eq!(Locale::from_str_or_en("fr"), Locale::En);
        assert_eq!(Locale::from_str_or_en(""), Locale::En);
    }

    #[test]
    fn link_prefixes_path_with_locale() {
        assert_eq!(Locale::En.link("https://x.eu", "/tree"), "https://x.eu/en/tree");
        assert_eq!(Locale::De.link("https://x.eu", "/account"), "https://x.eu/de/account");
        assert_eq!(
            Locale::De.link("https://x.eu", "/auth/consume?token=abc"),
            "https://x.eu/de/auth/consume?token=abc"
        );
    }

    #[test]
    fn link_trims_a_trailing_slash_on_the_base() {
        // No double slash when the configured base URL ends in `/`.
        assert_eq!(Locale::En.link("https://x.eu/", "/imprint"), "https://x.eu/en/imprint");
    }
}

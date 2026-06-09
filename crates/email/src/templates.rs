//! Locale-aware rendering of transactional emails (plain-text + HTML).
//!
//! Templates live in `crates/email/templates/` (askama's default lookup dir)
//! and compile into the binary. Each email has a `.txt` part and a `.html`
//! part; the HTML parts share `_base.html` (the bulletproof, table-based
//! Stack Overflow short-transactional shell, restyled to our CI with a
//! `prefers-color-scheme` dark variant) via `{% extends %}` and pull common
//! pieces — button, paste-link, footnote — from `_macros.html`.
//!
//! Escaping: the `.txt` templates set `escape = "none"` (plain text needs no
//! escaping); the `.html` templates use askama's default HTML escaper, so
//! every interpolated user value (names, family names, email addresses,
//! event lines) is HTML-escaped — the URLs we emit are trusted but escaping
//! them in `href` attributes is harmless.
//!
//! Each `render_*` helper returns a [`RenderedEmail`] (`subject` + `text` +
//! `html`) so call-sites can populate both MIME alternatives of an
//! [`crate::sender::OutboundEmail`].

use askama::Template;

use crate::locale::Locale;

/// Product name shown in every email (header wordmark, footer, subjects).
pub const APP_NAME: &str = "My Family Tree";

/// A fully rendered email: subject + both MIME alternatives.
///
/// `text` is the plain-text part; `html` is the styled
/// multipart-alternative part. Call-sites hand `text` to
/// [`crate::sender::OutboundEmail::text_body`] and `html` to `html_body`.
#[derive(Debug, Clone)]
pub struct RenderedEmail {
    pub subject: String,
    pub text: String,
    pub html: String,
}

/// Shared chrome (header / footer / dark-mode) context for every HTML email.
///
/// Held as a nested field on each HTML template struct so the `_base.html`
/// layout can reference `chrome.*` regardless of which concrete email is
/// extending it.
#[derive(Debug)]
struct Chrome<'a> {
    lang: &'a str,
    app_name: &'a str,
    app_url: &'a str,
    privacy_url: &'a str,
    privacy_label: &'a str,
}

impl<'a> Chrome<'a> {
    const fn new(locale: Locale, app_url: &'a str, privacy_url: &'a str) -> Self {
        let (lang, privacy_label) = match locale {
            Locale::En => ("en", "Privacy"),
            Locale::De => ("de", "Datenschutz"),
        };
        Self { lang, app_name: APP_NAME, app_url, privacy_url, privacy_label }
    }
}

/// Build the privacy-policy URL from the web app's public base URL.
///
/// The route is locale-prefixed `/{lang}/data-policy` (see the FE router), so
/// the footer link in every email lands on the recipient's-language legal
/// page rather than bouncing through a redirect.
fn privacy_url(locale: Locale, app_url: &str) -> String {
    locale.link(app_url, "/data-policy")
}

// ── magic link ──────────────────────────────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "magic_link_en.txt", escape = "none")]
struct MagicLinkEn<'a> {
    link: &'a str,
    name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "magic_link_de.txt", escape = "none")]
struct MagicLinkDe<'a> {
    link: &'a str,
    name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "magic_link_en.html")]
struct MagicLinkHtmlEn<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
    name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "magic_link_de.html")]
struct MagicLinkHtmlDe<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
    name: &'a str,
}

// ── welcome ─────────────────────────────────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "welcome_en.txt", escape = "none")]
struct WelcomeEn<'a> {
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "welcome_de.txt", escape = "none")]
struct WelcomeDe<'a> {
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "welcome_en.html")]
struct WelcomeHtmlEn<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "welcome_de.html")]
struct WelcomeHtmlDe<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
}

// ── invite ──────────────────────────────────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "invite_en.txt", escape = "none")]
struct InviteEn<'a> {
    link: &'a str,
    inviter_name: &'a str,
    family_name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "invite_de.txt", escape = "none")]
struct InviteDe<'a> {
    link: &'a str,
    inviter_name: &'a str,
    family_name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "invite_en.html")]
struct InviteHtmlEn<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
    inviter_name: &'a str,
    family_name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "invite_de.html")]
struct InviteHtmlDe<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
    inviter_name: &'a str,
    family_name: &'a str,
}

// ── email change ────────────────────────────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "email_change_en.txt", escape = "none")]
struct EmailChangeEn<'a> {
    link: &'a str,
    new_email: &'a str,
    name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "email_change_de.txt", escape = "none")]
struct EmailChangeDe<'a> {
    link: &'a str,
    new_email: &'a str,
    name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "email_change_en.html")]
struct EmailChangeHtmlEn<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
    new_email: &'a str,
    name: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "email_change_de.html")]
struct EmailChangeHtmlDe<'a> {
    chrome: Chrome<'a>,
    link: &'a str,
    new_email: &'a str,
    name: &'a str,
}

// ── owner transfer (owner side) ─────────────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "owner_transfer_owner_en.txt", escape = "none")]
struct OwnerTransferOwnerEn<'a> {
    family_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "owner_transfer_owner_de.txt", escape = "none")]
struct OwnerTransferOwnerDe<'a> {
    family_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "owner_transfer_owner_en.html")]
struct OwnerTransferOwnerHtmlEn<'a> {
    chrome: Chrome<'a>,
    family_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "owner_transfer_owner_de.html")]
struct OwnerTransferOwnerHtmlDe<'a> {
    chrome: Chrome<'a>,
    family_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

// ── owner transfer (incoming admin side) ────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "owner_transfer_admin_en.txt", escape = "none")]
struct OwnerTransferAdminEn<'a> {
    family_name: &'a str,
    from_user_display_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "owner_transfer_admin_de.txt", escape = "none")]
struct OwnerTransferAdminDe<'a> {
    family_name: &'a str,
    from_user_display_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "owner_transfer_admin_en.html")]
struct OwnerTransferAdminHtmlEn<'a> {
    chrome: Chrome<'a>,
    family_name: &'a str,
    from_user_display_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "owner_transfer_admin_de.html")]
struct OwnerTransferAdminHtmlDe<'a> {
    chrome: Chrome<'a>,
    family_name: &'a str,
    from_user_display_name: &'a str,
    to_user_display_name: &'a str,
    link: &'a str,
}

// ── reminder digest ─────────────────────────────────────────────────────

#[derive(Template, Debug)]
#[template(path = "reminder_digest_en.txt", escape = "none")]
struct ReminderDigestEn<'a> {
    lead_days: i32,
    count: usize,
    lines: &'a [String],
    tree_link: &'a str,
    manage_link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "reminder_digest_de.txt", escape = "none")]
struct ReminderDigestDe<'a> {
    lead_days: i32,
    count: usize,
    lines: &'a [String],
    tree_link: &'a str,
    manage_link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "reminder_digest_en.html")]
struct ReminderDigestHtmlEn<'a> {
    chrome: Chrome<'a>,
    lead_days: i32,
    count: usize,
    lines: &'a [String],
    tree_link: &'a str,
    manage_link: &'a str,
}

#[derive(Template, Debug)]
#[template(path = "reminder_digest_de.html")]
struct ReminderDigestHtmlDe<'a> {
    chrome: Chrome<'a>,
    lead_days: i32,
    count: usize,
    lines: &'a [String],
    tree_link: &'a str,
    manage_link: &'a str,
}

/// Inputs for the daily reminder digest.
///
/// `lines` are pre-rendered, localized one-liners (e.g. `"Anna — 40th
/// birthday"`); the worker builds them from the domain `UpcomingEvent`s so the
/// email crate stays free of projection logic.
#[derive(Debug)]
pub struct ReminderDigestArgs<'a> {
    pub lead_days: i32,
    pub lines: &'a [String],
    pub tree_link: &'a str,
    pub manage_link: &'a str,
}

// ── render helpers ──────────────────────────────────────────────────────

/// Render the magic-link sign-in email for `locale`.
///
/// `app_url` is the web app's public base URL (used for the header link +
/// the footer privacy link). `name` greets a known returning user by name
/// when present and non-empty; pass `None` (or an empty string) for an
/// anonymous "Hello!" greeting.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_magic_link(
    locale: Locale,
    app_url: &str,
    link: &str,
    name: Option<&str>,
) -> Result<RenderedEmail, askama::Error> {
    let name = name.unwrap_or("");
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (subject, text, html) = match locale {
        Locale::En => (
            format!("Sign in to {APP_NAME}"),
            MagicLinkEn { link, name }.render()?,
            MagicLinkHtmlEn { chrome, link, name }.render()?,
        ),
        Locale::De => (
            format!("Anmeldung bei {APP_NAME}"),
            MagicLinkDe { link, name }.render()?,
            MagicLinkHtmlDe { chrome, link, name }.render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

/// Render the welcome / onboarding email for a brand-new account.
///
/// Same single-use magic link as [`render_magic_link`] (the user still has
/// to click it to get in), but with a welcoming subject + onboarding nudge.
/// The API picks this variant only when the user row was just created.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_welcome(
    locale: Locale,
    app_url: &str,
    link: &str,
) -> Result<RenderedEmail, askama::Error> {
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (subject, text, html) = match locale {
        Locale::En => (
            format!("Welcome to {APP_NAME}"),
            WelcomeEn { link }.render()?,
            WelcomeHtmlEn { chrome, link }.render()?,
        ),
        Locale::De => (
            format!("Willkommen bei {APP_NAME}"),
            WelcomeDe { link }.render()?,
            WelcomeHtmlDe { chrome, link }.render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

/// Render the family-invite email for `locale`.
///
/// The subject embeds the family name verbatim. Goes to an address that may
/// not have an account yet, so there is no by-name greeting.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_invite(
    locale: Locale,
    app_url: &str,
    family_name: &str,
    inviter_name: &str,
    link: &str,
) -> Result<RenderedEmail, askama::Error> {
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (subject, text, html) = match locale {
        Locale::En => (
            format!("Join the {family_name} family on {APP_NAME}"),
            InviteEn { link, inviter_name, family_name }.render()?,
            InviteHtmlEn { chrome, link, inviter_name, family_name }.render()?,
        ),
        Locale::De => (
            format!("Einladung zur Familie {family_name} bei {APP_NAME}"),
            InviteDe { link, inviter_name, family_name }.render()?,
            InviteHtmlDe { chrome, link, inviter_name, family_name }.render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

/// Render the confirm-email-change email for `locale`.
///
/// Sent to the user's **current** address; `new_email` is the address they
/// want to switch to. `name` greets the (known) account holder by name.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_email_change(
    locale: Locale,
    app_url: &str,
    link: &str,
    new_email: &str,
    name: Option<&str>,
) -> Result<RenderedEmail, askama::Error> {
    let name = name.unwrap_or("");
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (subject, text, html) = match locale {
        Locale::En => (
            format!("Confirm your email change on {APP_NAME}"),
            EmailChangeEn { link, new_email, name }.render()?,
            EmailChangeHtmlEn { chrome, link, new_email, name }.render()?,
        ),
        Locale::De => (
            format!("Bestätige deine E-Mail-Änderung bei {APP_NAME}"),
            EmailChangeDe { link, new_email, name }.render()?,
            EmailChangeHtmlDe { chrome, link, new_email, name }.render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

/// Render the owner-side confirmation email for an ownership transfer.
///
/// Sent to the **current** owner's address so they confirm they really
/// initiated the handoff.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_owner_transfer_owner(
    locale: Locale,
    app_url: &str,
    family_name: &str,
    to_user_display_name: &str,
    link: &str,
) -> Result<RenderedEmail, askama::Error> {
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (subject, text, html) = match locale {
        Locale::En => (
            "Confirm ownership transfer".to_string(),
            OwnerTransferOwnerEn { family_name, to_user_display_name, link }.render()?,
            OwnerTransferOwnerHtmlEn { chrome, family_name, to_user_display_name, link }
                .render()?,
        ),
        Locale::De => (
            "Eigentumsübertragung bestätigen".to_string(),
            OwnerTransferOwnerDe { family_name, to_user_display_name, link }.render()?,
            OwnerTransferOwnerHtmlDe { chrome, family_name, to_user_display_name, link }
                .render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

/// Render the target-admin-side acceptance email for an ownership transfer.
///
/// Sent to the prospective new owner so they confirm they accept the swap.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_owner_transfer_admin(
    locale: Locale,
    app_url: &str,
    family_name: &str,
    from_user_display_name: &str,
    to_user_display_name: &str,
    link: &str,
) -> Result<RenderedEmail, askama::Error> {
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (subject, text, html) = match locale {
        Locale::En => (
            format!("You've been offered ownership of \"{family_name}\""),
            OwnerTransferAdminEn {
                family_name,
                from_user_display_name,
                to_user_display_name,
                link,
            }
            .render()?,
            OwnerTransferAdminHtmlEn {
                chrome,
                family_name,
                from_user_display_name,
                to_user_display_name,
                link,
            }
            .render()?,
        ),
        Locale::De => (
            format!("Eigentumsübertragung für „{family_name}\" angeboten"),
            OwnerTransferAdminDe {
                family_name,
                from_user_display_name,
                to_user_display_name,
                link,
            }
            .render()?,
            OwnerTransferAdminHtmlDe {
                chrome,
                family_name,
                from_user_display_name,
                to_user_display_name,
                link,
            }
            .render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

/// Render the daily reminder digest for `locale`.
///
/// `args.lines` are the localized event lines; the subject summarizes the
/// count + lead time. An empty `lines` slice still renders, but callers
/// should skip sending when there are no events.
///
/// # Errors
/// Returns [`askama::Error`] if template rendering fails.
pub fn render_reminder_digest(
    locale: Locale,
    app_url: &str,
    args: &ReminderDigestArgs<'_>,
) -> Result<RenderedEmail, askama::Error> {
    let count = args.lines.len();
    let subject = match (locale, args.lead_days) {
        (Locale::De, 0) => {
            format!("🎂 Heute: {count} Familien-Termin{}", if count == 1 { "" } else { "e" })
        }
        (Locale::De, n) => {
            format!("🎂 In {n} Tagen: {count} Familien-Termin{}", if count == 1 { "" } else { "e" })
        }
        (Locale::En, 0) => {
            format!("🎂 Today: {count} family date{}", if count == 1 { "" } else { "s" })
        }
        (Locale::En, n) => {
            format!("🎂 In {n} days: {count} family date{}", if count == 1 { "" } else { "s" })
        }
    };
    let privacy = privacy_url(locale, app_url);
    let chrome = Chrome::new(locale, app_url, &privacy);
    let (text, html) = match locale {
        Locale::En => (
            ReminderDigestEn {
                lead_days: args.lead_days,
                count,
                lines: args.lines,
                tree_link: args.tree_link,
                manage_link: args.manage_link,
            }
            .render()?,
            ReminderDigestHtmlEn {
                chrome,
                lead_days: args.lead_days,
                count,
                lines: args.lines,
                tree_link: args.tree_link,
                manage_link: args.manage_link,
            }
            .render()?,
        ),
        Locale::De => (
            ReminderDigestDe {
                lead_days: args.lead_days,
                count,
                lines: args.lines,
                tree_link: args.tree_link,
                manage_link: args.manage_link,
            }
            .render()?,
            ReminderDigestHtmlDe {
                chrome,
                lead_days: args.lead_days,
                count,
                lines: args.lines,
                tree_link: args.tree_link,
                manage_link: args.manage_link,
            }
            .render()?,
        ),
    };
    Ok(RenderedEmail { subject, text, html })
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    const APP: &str = "https://app";

    #[test]
    fn renders_de_invite() {
        let email = render_invite(Locale::De, APP, "Müller", "Anna", "https://app/i/abc").unwrap();
        assert!(email.subject.contains("Müller"));
        assert!(email.text.contains("Anna"));
        assert!(email.text.contains("https://app/i/abc"));
        assert!(email.html.contains("Anna"));
        assert!(email.html.contains("cid:logo"));
    }

    #[test]
    fn renders_en_magic_link() {
        let email = render_magic_link(Locale::En, APP, "https://app/c/xyz", None).unwrap();
        assert_eq!(email.subject, "Sign in to My Family Tree");
        assert!(email.text.contains("https://app/c/xyz"));
        assert!(email.html.contains("https://app/c/xyz"));
        // No name → anonymous greeting, no "Hello <name>,".
        assert!(email.text.contains("Hello!"));
    }

    #[test]
    fn footer_privacy_link_is_locale_prefixed() {
        // The footer's privacy link must carry the recipient's locale so it
        // lands on the right-language legal page (no redirect hop).
        let en = render_magic_link(Locale::En, APP, "https://app/en/c/xyz", None).unwrap();
        assert!(en.html.contains("https://app/en/data-policy"));
        let de = render_magic_link(Locale::De, APP, "https://app/de/c/xyz", None).unwrap();
        assert!(de.html.contains("https://app/de/data-policy"));
    }

    #[test]
    fn renders_magic_link_greets_known_user_by_name() {
        let email = render_magic_link(Locale::En, APP, "https://app/c/xyz", Some("Anna")).unwrap();
        assert!(email.text.contains("Hello Anna,"));
        assert!(email.html.contains("Hello Anna,"));
        assert!(!email.text.contains("Hello!"));
    }

    #[test]
    fn html_escapes_user_supplied_names() {
        // A family name with HTML must not break out into markup.
        let email =
            render_invite(Locale::En, APP, "<script>x</script>", "Bob", "https://app/i/xyz")
                .unwrap();
        assert!(!email.html.contains("<script>x</script>"));
        assert!(email.html.contains("&#60;script&#62;") || email.html.contains("&lt;script&gt;"));
    }

    #[test]
    fn renders_de_magic_link_with_umlauts() {
        let email = render_magic_link(Locale::De, APP, "https://app/c/xyz", None).unwrap();
        assert_eq!(email.subject, "Anmeldung bei My Family Tree");
        assert!(email.text.contains("gültig"));
        assert!(email.text.contains("https://app/c/xyz"));
    }

    #[test]
    fn renders_en_welcome_with_signin_link() {
        let email = render_welcome(Locale::En, APP, "https://app/c/new").unwrap();
        assert_eq!(email.subject, "Welcome to My Family Tree");
        assert!(email.text.to_lowercase().contains("welcome"));
        assert!(email.text.contains("https://app/c/new"));
        assert!(email.html.contains("https://app/c/new"));
        assert!(email.html.contains("cid:logo"));
        assert!(email.html.contains("My Family Tree"));
        // Privacy link is locale-prefixed (EN here).
        assert!(email.html.contains("https://app/en/data-policy"));
    }

    #[test]
    fn renders_de_welcome_with_umlauts_and_signin_link() {
        let email = render_welcome(Locale::De, "https://app/", "https://app/c/new").unwrap();
        assert_eq!(email.subject, "Willkommen bei My Family Tree");
        assert!(email.text.contains("gültig"));
        assert!(email.html.contains("https://app/c/new"));
        // Locale-prefixed (DE) privacy link; a trailing slash on the base URL
        // must not double up.
        assert!(email.html.contains("https://app/de/data-policy"));
        assert!(!email.html.contains("https://app//de/data-policy"));
    }

    #[test]
    fn renders_en_invite() {
        let email = render_invite(Locale::En, APP, "Smith", "Bob", "https://app/i/xyz").unwrap();
        assert!(email.subject.contains("Smith"));
        assert!(email.text.contains("Bob"));
        assert!(email.html.contains("https://app/i/xyz"));
    }

    #[test]
    fn renders_de_email_change_with_umlauts_and_new_email() {
        let email =
            render_email_change(Locale::De, APP, "https://app/ec/abc", "neu@example.com", None)
                .unwrap();
        assert_eq!(email.subject, "Bestätige deine E-Mail-Änderung bei My Family Tree");
        assert!(email.text.contains("neu@example.com"));
        assert!(email.text.contains("https://app/ec/abc"));
        assert!(email.text.contains("bleibt unverändert"));
        assert!(email.html.contains("neu@example.com"));
    }

    #[test]
    fn renders_en_email_change() {
        let email =
            render_email_change(Locale::En, APP, "https://app/ec/xyz", "new@example.com", None)
                .unwrap();
        assert_eq!(email.subject, "Confirm your email change on My Family Tree");
        assert!(email.text.contains("new@example.com"));
        assert!(email.html.contains("https://app/ec/xyz"));
    }

    #[test]
    fn renders_owner_transfer_owner_and_admin() {
        let owner =
            render_owner_transfer_owner(Locale::En, APP, "Müller", "Bob", "https://app/ot/owner")
                .unwrap();
        assert_eq!(owner.subject, "Confirm ownership transfer");
        assert!(owner.html.contains("Müller"));
        assert!(owner.html.contains("Bob"));
        assert!(owner.html.contains("https://app/ot/owner"));

        let admin = render_owner_transfer_admin(
            Locale::De,
            APP,
            "Müller",
            "Alice",
            "Bob",
            "https://app/ot/admin",
        )
        .unwrap();
        assert!(admin.subject.contains("Müller"));
        assert!(admin.html.contains("Alice"));
        assert!(admin.html.contains("Bob"));
    }

    #[test]
    fn renders_de_digest_with_two_lines() {
        let lines =
            vec!["Anna — 40. Geburtstag".to_string(), "Klaus & Maria — 10. Jahrestag".to_string()];
        let email = render_reminder_digest(
            Locale::De,
            APP,
            &ReminderDigestArgs {
                lead_days: 7,
                lines: &lines,
                tree_link: "https://app/tree",
                manage_link: "https://app/account",
            },
        )
        .unwrap();
        assert!(email.subject.contains("In 7 Tagen"));
        assert!(email.subject.contains('2'));
        assert!(email.text.contains("Anna — 40. Geburtstag"));
        assert!(email.text.contains("Klaus & Maria — 10. Jahrestag"));
        assert!(email.html.contains("https://app/tree"));
        // `&` in an event line must be HTML-escaped in the HTML part.
        assert!(
            email.html.contains("Klaus &#38; Maria") || email.html.contains("Klaus &amp; Maria")
        );
    }

    #[test]
    fn renders_en_digest_day_of_singular() {
        let lines = vec!["Bob — 30th birthday".to_string()];
        let email = render_reminder_digest(
            Locale::En,
            APP,
            &ReminderDigestArgs {
                lead_days: 0,
                lines: &lines,
                tree_link: "https://app/tree",
                manage_link: "https://app/account",
            },
        )
        .unwrap();
        assert!(email.subject.contains("Today"));
        assert!(email.subject.contains("family date"));
        assert!(!email.subject.contains("dates"), "singular count uses 'date' not 'dates'");
        assert!(email.text.contains("Today's family dates"));
        assert!(email.text.contains("Bob — 30th birthday"));
    }
}

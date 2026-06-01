//! Regression coverage for the security audit fixes shipped in
//! `cf0c9b2` (1 High + 5 Medium), `964c299` (4 Low),
//! `a420ccd` (Info: `deny_unknown_fields`), and `d984474` (Info: token IP caps).
//!
//! One test per finding — small and surgical, each pinning the exact
//! attacker shape the audit described so a future regression flips the
//! red bit in the same place.
//!
//! Tests for the token-endpoint per-IP caps (consume / refresh / accept /
//! owner-transfer-confirm — `d984474`) are intentionally omitted: those
//! cap at 120/hour each, so a regression test would need 120+ successful
//! sign-ins per test which dominates runtime without changing the
//! contract being asserted. The cap on `/users/me/email-change` is 5/hour
//! and IS tested below.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic,
    clippy::future_not_send,
    clippy::shadow_unrelated,
    clippy::shadow_reuse,
    clippy::shadow_same,
    clippy::too_many_lines,
    reason = "test code: testcontainers + assertion helpers may panic and aren't Send-bounded; shadowing matches the existing flow tests"
)]

mod common;

use actix_web::cookie::Cookie;
use actix_web::test;
use common::{create_family, ephemeral_stack, sign_in};
use my_fam_tree_api::build_app;
use my_fam_tree_domain::{FamilyId, Role};
use uuid::Uuid;

/// Pull `token` out of a `…?token=XYZ` URL in an email body. Mirrors the
/// helper used by the invite / owner-transfer flow tests.
fn token_from_link(body: &str) -> String {
    let after = body.split("token=").nth(1).expect("token= present");
    after.split(|c: char| c.is_whitespace() || c == '"').next().expect("token chars").to_string()
}

/// Create a person and return its id. Mirrors the helper in
/// `person_photo_flow.rs` so each test file stays self-contained.
#[allow(clippy::future_not_send)]
async fn create_person<S, B>(app: &S, access: &str, family_id: &str, given_name: &str) -> String
where
    S: actix_web::dev::Service<
            actix_http::Request,
            Response = actix_web::dev::ServiceResponse<B>,
            Error = actix_web::Error,
        >,
    B: actix_web::body::MessageBody,
{
    let req = test::TestRequest::post()
        .uri("/api/v1/persons")
        .cookie(Cookie::new("access", access.to_string()))
        .insert_header(("X-Family-Id", family_id.to_string()))
        .set_json(serde_json::json!({ "given_name": given_name }))
        .to_request();
    let res = test::call_service(app, req).await;
    assert_eq!(res.status(), 200, "create person `{given_name}` should succeed");
    let body: serde_json::Value = test::read_body_json(res).await;
    body["data"]["id"].as_str().expect("person id").to_string()
}

// ---------------------------------------------------------------------------
// HIGH: stale-role privilege window (require_db_role)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn demoted_admin_loses_privilege_immediately_not_at_token_ttl() {
    // Original shape: admin's access cookie carries `role=admin` baked in
    // at issue time. After the owner demotes them to `user` in the DB,
    // the cookie still claims admin until access TTL expires (15 min).
    // The DB-level role check now fetches the live membership row so
    // the next privileged write rejects with insufficient_role.
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (owner_access, _r) = sign_in(&stack, &app, "stale-owner@example.com").await;
    let (_owner_access, family_id) = create_family(&app, &owner_access, "StaleRole").await;
    let (_admin_access, _r) = sign_in(&stack, &app, "stale-admin@example.com").await;

    // Insert admin's membership directly through the repo: cheaper than
    // running the full invite flow and gives us a clean role state.
    let admin_user_id = stack
        .state
        .users
        .find_by_email("stale-admin@example.com")
        .await
        .expect("find admin")
        .expect("admin exists")
        .id;
    let fid = my_fam_tree_domain::FamilyId::from_uuid(
        uuid::Uuid::parse_str(&family_id).expect("family uuid"),
    );
    stack
        .state
        .memberships
        .insert(fid, admin_user_id, my_fam_tree_domain::Role::Admin)
        .await
        .expect("admin membership");

    // Sign the admin back in so the access cookie reflects the admin role
    // (otherwise it would still say "user" from before the row was
    // inserted — the JWT only includes families the user already
    // belonged to at issuance).
    let (admin_access, _r) = sign_in(&stack, &app, "stale-admin@example.com").await;

    // Sanity: admin CAN list members while still admin in DB.
    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/families/{family_id}/members"))
        .cookie(Cookie::new("access", admin_access.clone()))
        .insert_header(("X-Family-Id", family_id.clone()))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200, "admin should be able to list members");

    // Owner demotes admin to plain user via the DB (mirrors what
    // members::set_member_role would do).
    stack
        .state
        .memberships
        .set_role(fid, admin_user_id, my_fam_tree_domain::Role::User)
        .await
        .expect("demote admin");

    // The admin's access cookie still claims admin (JWT is unchanged).
    // The next privileged read must reject with 403 because the DB-level
    // check sees the real role now.
    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/families/{family_id}/members"))
        .cookie(Cookie::new("access", admin_access))
        .insert_header(("X-Family-Id", family_id))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 403, "demoted admin must lose access immediately");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "family_insufficient_role");
}

// ---------------------------------------------------------------------------
// HIGH: parent_links cross-family IDOR (cf0c9b2)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parent_links_create_rejects_cross_family_child_or_parent() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access_a, _r) = sign_in(&stack, &app, "audit-pl-a@example.com").await;
    let (access_a, family_a) = create_family(&app, &access_a, "F-A").await;
    let child_a = create_person(&app, &access_a, &family_a, "Child").await;
    let parent_a = create_person(&app, &access_a, &family_a, "Parent").await;

    let (access_b, _r) = sign_in(&stack, &app, "audit-pl-b@example.com").await;
    let (access_b, family_b) = create_family(&app, &access_b, "F-B").await;

    // Attacker in family B tries to plant a parent_link between two F-A persons.
    let req = test::TestRequest::post()
        .uri("/api/v1/parent-links")
        .cookie(Cookie::new("access", access_b.clone()))
        .insert_header(("X-Family-Id", family_b))
        .set_json(serde_json::json!({
            "child_id": child_a,
            "parent_id": parent_a,
            "kind": "biological",
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 404, "cross-family parent_link must 404");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "person_not_found");
}

// ---------------------------------------------------------------------------
// MED: partnerships cross-family IDOR (cf0c9b2)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn partnerships_create_rejects_cross_family_partner_ids() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access_a, _r) = sign_in(&stack, &app, "audit-pa-a@example.com").await;
    let (access_a, family_a) = create_family(&app, &access_a, "Audit-A").await;
    let p_a = create_person(&app, &access_a, &family_a, "PartnerA").await;
    let p_b = create_person(&app, &access_a, &family_a, "PartnerB").await;

    let (access_b, _r) = sign_in(&stack, &app, "audit-pa-b@example.com").await;
    let (access_b, family_b) = create_family(&app, &access_b, "Audit-B").await;

    let req = test::TestRequest::post()
        .uri("/api/v1/partnerships")
        .cookie(Cookie::new("access", access_b.clone()))
        .insert_header(("X-Family-Id", family_b))
        .set_json(serde_json::json!({
            "partner_a_id": p_a,
            "partner_b_id": p_b,
            "kind": "marriage",
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 404, "cross-family partnership must 404");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "person_not_found");
}

// ---------------------------------------------------------------------------
// MED: family_invites cross-family person_id IDOR (cf0c9b2)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn family_invite_rejects_cross_family_person_id() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access_a, _r) = sign_in(&stack, &app, "audit-fi-a@example.com").await;
    let (access_a, family_a) = create_family(&app, &access_a, "Inv-A").await;
    let person_a = create_person(&app, &access_a, &family_a, "TargetPerson").await;

    let (access_b, _r) = sign_in(&stack, &app, "audit-fi-b@example.com").await;
    let (access_b, family_b) = create_family(&app, &access_b, "Inv-B").await;

    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/families/{family_b}/invites"))
        .cookie(Cookie::new("access", access_b.clone()))
        .set_json(serde_json::json!({
            "email": "outsider@example.com",
            "role": "user",
            "person_id": person_a,
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 404, "invite referencing a foreign person must 404");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "person_not_found");
}

// ---------------------------------------------------------------------------
// LOW: EmailTaken response no longer echoes the submitted address (964c299)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn email_taken_response_does_not_echo_the_email() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    // Two existing users — A is the caller, B owns the target address.
    let (access_a, _r) = sign_in(&stack, &app, "audit-et-caller@example.com").await;
    let _ = sign_in(&stack, &app, "audit-et-owner@example.com").await;

    // Caller tries to swap their email to B's address.
    let req = test::TestRequest::post()
        .uri("/api/v1/users/me/email-change")
        .cookie(Cookie::new("access", access_a.clone()))
        .set_json(serde_json::json!({ "new_email": "audit-et-owner@example.com" }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 409, "duplicate email returns 409");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "email_taken");

    // Critical: the response body must not name the address — that was the
    // existence-probe vector. The unit-variant variant emits a generic
    // "email already in use" detail.
    let payload = serde_json::to_string(&body).expect("serialise back");
    assert!(
        !payload.contains("audit-et-owner@example.com"),
        "EmailTaken body must not echo the email; got: {payload}",
    );
}

// ---------------------------------------------------------------------------
// INFO: DTO deny_unknown_fields (a420ccd)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn persons_create_rejects_unknown_field() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access, _r) = sign_in(&stack, &app, "audit-deny@example.com").await;
    let (access, family_id) = create_family(&app, &access, "Deny").await;

    // Body includes a typo'd field — `linkedUserId` (camelCase) instead of
    // `linked_user_id`. With `deny_unknown_fields` this surfaces as a 400 /
    // 422 deserialise failure instead of silently dropping the field.
    let req = test::TestRequest::post()
        .uri("/api/v1/persons")
        .cookie(Cookie::new("access", access.clone()))
        .insert_header(("X-Family-Id", family_id))
        .set_json(serde_json::json!({
            "given_name": "Typo",
            "linkedUserId": "00000000-0000-0000-0000-000000000000",
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    // Actix-web returns 400 for JSON deserialise errors before the handler
    // body runs; the 422 path is for handler-level Validation errors.
    let status = res.status().as_u16();
    assert!(
        status == 400 || status == 422,
        "unknown field should be rejected with 400 or 422, got {status}",
    );
}

// ---------------------------------------------------------------------------
// LOW: /users/me/email-change has a per-user rate cap (964c299)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn email_change_rate_caps_at_5_per_hour_per_user() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access, _r) = sign_in(&stack, &app, "audit-ec@example.com").await;

    // First five attempts pass the rate gate (they may 4xx on email
    // already-in-use, but they shouldn't be 429). We don't care about the
    // status here — the regression is "rate gate eventually fires".
    for i in 0..5_u8 {
        let req = test::TestRequest::post()
            .uri("/api/v1/users/me/email-change")
            .cookie(Cookie::new("access", access.clone()))
            .set_json(
                serde_json::json!({ "new_email": format!("audit-ec-target-{i}@example.com") }),
            )
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_ne!(res.status(), 429, "request {i} should not be rate-limited yet (cap is 5/hour)");
    }

    // Sixth attempt MUST 429 — rate gate's exceeded.
    let req = test::TestRequest::post()
        .uri("/api/v1/users/me/email-change")
        .cookie(Cookie::new("access", access.clone()))
        .set_json(serde_json::json!({ "new_email": "audit-ec-target-final@example.com" }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 429, "sixth attempt within the window must be 429");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "rate_limited");
}

// ---------------------------------------------------------------------------
// MED: person free-text field length caps (cf0c9b2)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn person_fields_reject_overlong_strings() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access, _r) = sign_in(&stack, &app, "audit-pl@example.com").await;
    let (access, family_id) = create_family(&app, &access, "Lengths").await;

    // given_name cap is 200 chars.
    let long_name = "x".repeat(201);
    let req = test::TestRequest::post()
        .uri("/api/v1/persons")
        .cookie(Cookie::new("access", access.clone()))
        .insert_header(("X-Family-Id", family_id.clone()))
        .set_json(serde_json::json!({ "given_name": long_name }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 422, "201-char given_name must 422");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["fields"][0]["code"], "validation.string_too_long");
    assert_eq!(body["fields"][0]["path"], "/given_name");

    // notes cap is 2000 chars (highest of the person fields).
    let long_notes = "x".repeat(2001);
    let req = test::TestRequest::post()
        .uri("/api/v1/persons")
        .cookie(Cookie::new("access", access.clone()))
        .insert_header(("X-Family-Id", family_id.clone()))
        .set_json(serde_json::json!({ "given_name": "OK", "notes": long_notes }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 422, "2001-char notes must 422");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["fields"][0]["path"], "/notes");

    // gender cap is 100 chars (short bucket).
    let long_gender = "x".repeat(101);
    let req = test::TestRequest::post()
        .uri("/api/v1/persons")
        .cookie(Cookie::new("access", access.clone()))
        .insert_header(("X-Family-Id", family_id.clone()))
        .set_json(serde_json::json!({ "given_name": "OK", "gender": long_gender }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 422, "101-char gender must 422");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["fields"][0]["path"], "/gender");
}

// ---------------------------------------------------------------------------
// MED: family name length cap + CR/LF rejection (cf0c9b2)
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn family_name_rejects_newlines_and_overlong_input() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;

    let (access, _r) = sign_in(&stack, &app, "audit-fn@example.com").await;

    // Newline in family name — header-injection hardening on the email
    // Subject path (lettre already escapes, but the validator is the
    // first line of defence).
    let req = test::TestRequest::post()
        .uri("/api/v1/families")
        .cookie(Cookie::new("access", access.clone()))
        .set_json(serde_json::json!({ "name": "Schmidt\nInjected: x" }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 422, "newline in name must 422");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["fields"][0]["code"], "validation.value_invalid");

    // Length cap (200 chars).
    let long = "x".repeat(201);
    let req = test::TestRequest::post()
        .uri("/api/v1/families")
        .cookie(Cookie::new("access", access.clone()))
        .set_json(serde_json::json!({ "name": long }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 422, "overlong name must 422");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["fields"][0]["code"], "validation.string_too_long");
}

// ---------------------------------------------------------------------------
// FIX #2: invite accept validates the session email BEFORE consuming. A
// wrong signed-in user gets 422 and the invite STAYS pending so the rightful
// recipient can still accept it.
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invite_accept_wrong_session_does_not_burn_token() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;
    let stamp = u128::from(rand::random::<u32>());

    // Admin/owner creates a family and an invite for `invitee`.
    let (owner_access, _r) =
        sign_in(&stack, &app, &format!("inv2-owner-{stamp}@example.com")).await;
    let (owner_access, family_id_str) =
        create_family(&app, &owner_access, &format!("Inv2-{stamp}")).await;
    let family_id = FamilyId::from_uuid(family_id_str.parse::<Uuid>().unwrap());

    let invitee_email = format!("inv2-invitee-{stamp}@example.com");
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/families/{family_id_str}/invites"))
        .cookie(Cookie::new("access", owner_access))
        .set_json(serde_json::json!({ "email": invitee_email, "role": "user" }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status().as_u16(), 200);
    let invite_token = {
        let captured = stack.fake_email.drain();
        let mail = captured.iter().find(|m| m.to_addr == invitee_email).expect("invite email");
        token_from_link(&mail.text_body)
    };

    // A DIFFERENT signed-in user (neither the inviter nor the invitee) tries
    // to accept. This must 422 and NOT consume the invite.
    let (other_access, _r) =
        sign_in(&stack, &app, &format!("inv2-other-{stamp}@example.com")).await;
    let req = test::TestRequest::post()
        .uri("/api/v1/invites/accept")
        .cookie(Cookie::new("access", other_access))
        .set_json(serde_json::json!({ "token": invite_token.clone() }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status().as_u16(), 422, "wrong session must 422");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "validation_failed");

    // The invite is STILL pending after the rejected attempt.
    let pending = stack.state.invites.list_pending_for_family(family_id).await.expect("pending");
    assert_eq!(pending.len(), 1, "invite must remain pending after wrong-session 422");

    // The rightful invitee can now accept it → membership inserted.
    let (invitee_access, _r) = sign_in(&stack, &app, &invitee_email).await;
    let req = test::TestRequest::post()
        .uri("/api/v1/invites/accept")
        .cookie(Cookie::new("access", invitee_access))
        .set_json(serde_json::json!({ "token": invite_token }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status().as_u16(), 200, "rightful invitee must still be able to accept");

    let invitee = stack
        .state
        .users
        .find_by_email(&invitee_email)
        .await
        .expect("lookup")
        .expect("invitee user");
    let m = stack.state.memberships.find(family_id, invitee.id).await.expect("find membership");
    assert!(m.is_some(), "membership inserted for the rightful invitee");
}

// ---------------------------------------------------------------------------
// FIX #3: owner-transfer confirm binds to the authenticated user. A third
// authed user presenting a leaked transfer token gets 403 and the side's
// `*_confirmed_at` is unchanged.
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owner_transfer_confirm_rejects_wrong_actor_without_burning_side() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;
    let stamp = u128::from(rand::random::<u32>());

    // Owner + admin on one family.
    let owner_email = format!("xfer3-owner-{stamp}@example.com");
    let admin_email = format!("xfer3-admin-{stamp}@example.com");
    let (owner_access, _r) = sign_in(&stack, &app, &owner_email).await;
    let (owner_access, family_id_str) =
        create_family(&app, &owner_access, &format!("Xfer3-{stamp}")).await;
    let family_id = FamilyId::from_uuid(family_id_str.parse::<Uuid>().unwrap());

    let _ = sign_in(&stack, &app, &admin_email).await;
    let admin_id =
        stack.state.users.find_by_email(&admin_email).await.expect("lookup").expect("admin").id;
    stack.state.memberships.insert(family_id, admin_id, Role::Admin).await.expect("admin member");

    // Owner begins the transfer (two emails dispatched). The access cookie
    // from `create_family` already carries the owner role.
    let _ = stack.fake_email.drain();
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/families/{family_id_str}/transfer-owner"))
        .cookie(Cookie::new("access", owner_access))
        .insert_header(("X-Family-Id", family_id_str.clone()))
        .set_json(serde_json::json!({ "to_user_id": admin_id.into_uuid() }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status().as_u16(), 200);
    let outbox = stack.fake_email.drain();
    let confirm_mail = outbox.iter().find(|e| e.subject.contains("Confirm ownership")).unwrap();
    let from_token = token_from_link(&confirm_mail.text_body);

    // A THIRD authed user (neither from nor to) presents the owner-side token.
    let (third_access, _r) =
        sign_in(&stack, &app, &format!("xfer3-third-{stamp}@example.com")).await;
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/families/{family_id_str}/transfer-owner/confirm"))
        .cookie(Cookie::new("access", third_access))
        .insert_header(("X-Family-Id", family_id_str.clone()))
        .set_json(serde_json::json!({ "token": from_token }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status().as_u16(), 403, "wrong actor must 403");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "family_insufficient_role");

    // The from-side confirmation is UNCHANGED.
    let active = stack
        .state
        .owner_transfers
        .find_active(family_id)
        .await
        .expect("find active")
        .expect("transfer still pending");
    assert!(active.from_confirmed_at.is_none(), "from side must NOT be confirmed by wrong actor");
    assert!(active.to_confirmed_at.is_none());
}

// ---------------------------------------------------------------------------
// FIX #5: email-change confirm validates purpose + owner BEFORE consuming. A
// wrong authed user presenting another user's email-change token gets 401 and
// the token stays consumable by the rightful owner.
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn email_change_confirm_wrong_user_does_not_burn_token() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;
    let stamp = u128::from(rand::random::<u32>());

    // Victim requests an email change → magic link sent to their old address.
    let victim_email = format!("ec5-victim-{stamp}@example.com");
    let (victim_access, _r) = sign_in(&stack, &app, &victim_email).await;
    stack.fake_email.drain();
    let new_email = format!("ec5-new-{stamp}@example.com");
    let req = test::TestRequest::post()
        .uri("/api/v1/users/me/email-change")
        .cookie(Cookie::new("access", victim_access.clone()))
        .set_json(serde_json::json!({ "new_email": new_email }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200);
    let token = {
        let captured = stack.fake_email.drain();
        let mail = captured.last().expect("email-change email");
        token_from_link(&mail.text_body)
    };

    // A DIFFERENT authed user tries to confirm the victim's token.
    let (attacker_access, _r) =
        sign_in(&stack, &app, &format!("ec5-attacker-{stamp}@example.com")).await;
    let req = test::TestRequest::post()
        .uri("/api/v1/users/me/email-change/confirm")
        .cookie(Cookie::new("access", attacker_access))
        .set_json(serde_json::json!({ "token": token.clone() }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401, "wrong user must 401");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "auth_magic_link_invalid");

    // The rightful owner can STILL confirm — the token wasn't burned.
    let req = test::TestRequest::post()
        .uri("/api/v1/users/me/email-change/confirm")
        .cookie(Cookie::new("access", victim_access))
        .set_json(serde_json::json!({ "token": token }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200, "rightful owner must still confirm the still-valid token");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["data"]["email"], new_email);
}

// ---------------------------------------------------------------------------
// FIX #6: refresh-token reuse detection. After one rotation the old token is
// revoked; re-presenting it 401s AND revokes every session — so the NEW
// (previously valid) token then also fails.
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn refresh_token_reuse_revokes_all_sessions() {
    let stack = ephemeral_stack().await;
    let app = test::init_service(build_app(stack.state.clone(), None)).await;
    let stamp = u128::from(rand::random::<u32>());

    let (_access, refresh_old) =
        sign_in(&stack, &app, &format!("reuse6-{stamp}@example.com")).await;

    // First refresh: rotates. We capture the NEW refresh cookie and the old
    // one is now revoked.
    let req = test::TestRequest::post()
        .uri("/api/v1/auth/refresh")
        .cookie(Cookie::new("refresh", refresh_old.clone()))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200, "first refresh rotates");
    let refresh_new = res
        .response()
        .cookies()
        .find(|c| c.name() == "refresh")
        .expect("rotated refresh cookie")
        .value()
        .to_string();
    assert_ne!(refresh_new, refresh_old, "rotation must mint a new token");

    // Re-present the OLD (now revoked) token → reuse detected → 401.
    let req = test::TestRequest::post()
        .uri("/api/v1/auth/refresh")
        .cookie(Cookie::new("refresh", refresh_old))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401, "reused old token must 401");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "auth_refresh_invalid");

    // The reuse handler revoked ALL sessions, so the NEW token (which WAS
    // valid until now) must now also fail.
    let req = test::TestRequest::post()
        .uri("/api/v1/auth/refresh")
        .cookie(Cookie::new("refresh", refresh_new))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401, "all sessions revoked: the new token must also fail");
    let body: serde_json::Value = test::read_body_json(res).await;
    assert_eq!(body["code"], "auth_refresh_invalid");
}

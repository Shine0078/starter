# Email deliverability

Engineering preparation for `Final Goal.md` P1.6. Code already sends
verification, reset, passkey, and deletion mail when SMTP is configured. This
is not proof that production mail is deliverable.

## Required DNS

| Record | Purpose |
| --- | --- |
| SPF | Authorize the SMTP provider for the From domain |
| DKIM | Provider-generated selector; must verify in the provider dashboard |
| DMARC | Start with `p=none` while measuring, then tighten |

## Product mail to prove

- Email verification
- Password reset
- Passkey added / removed
- Account deletion scheduled / cancelled
- Bounce and retry behaviour

## Privacy

Mail bodies must not include balances, transaction lists, bank tokens, or
recovery codes. Links should be opaque tokens, not account identifiers.

## Owner actions

1. Choose a production SMTP provider (Gmail app passwords are preview-only).
2. Set `SMTP_*` and `EMAIL_FROM` on Cloud Run.
3. Publish SPF/DKIM/DMARC for the From domain.
4. Send one of each message to a real inbox and record the Message-ID.
5. Confirm bounces do not leak financial content into logs.

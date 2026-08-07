# Future Enhancements

Ranked by impact vs. effort.

## Near-term (1–2 sprints)

1. **Bulk student import from Excel/CSV** — school admin uploads a spreadsheet; server validates rows, returns error report, imports valid rows.
2. **Push notifications** — FCM to teachers when their upload fails or requires action.
3. **Attendance module** — extend the mobile app to mark attendance per class; QR-scan a student's ID.
4. **Parent portal (mobile web)** — read-only view of the student profile via a signed URL sent over SMS.
5. **In-app photo re-capture flow** — flag photos with detected issues (blur, no face, tilted) automatically.

## Mid-term (1–2 quarters)

6. **Delta sync API** — `GET /students?since={cursor}` for the dashboard to update lists efficiently.
7. **Template designer** — WYSIWYG HTML editor for ID card templates with live preview.
8. **MFA for admins** — TOTP (Google Authenticator).
9. **Fingerprint / biometric login** on Android via `BiometricPrompt`.
10. **Rich search** — Postgres `tsvector` or dedicated OpenSearch cluster for large-scale full-text.
11. **Offline-capable dashboard** — via IndexedDB + Service Worker for on-campus admins with flaky Wi-Fi.

## Long-term

12. **Multi-tenant white-labelling** — per-school domain, branding, template packs.
13. **Report analytics workbench** — Superset / Metabase dashboard for boards of education.
14. **Government ID integrations** — Aadhaar (India), APAAR ID linking with consent.
15. **iOS teacher app** — Swift + SwiftUI mirror of the Android app.
16. **On-device ML** — face detection, blur detection, and passport-crop entirely offline via MLKit + TFLite.
17. **Signed digital ID cards** — issue verifiable credentials (W3C VC) for cross-institution portability.
18. **Regional data residency** — deploy stacks per region with data-locality policies.
19. **Federated identity** — SSO via Google Workspace for Education, Microsoft 365.
20. **AI-generated communications** — parental notices, event invitations composed by an LLM and reviewed by school admin.

## Reliability / Ops

- Chaos engineering: game days to verify failover.
- Auto-remediation runbooks for common alerts.
- Load test at 5× projected peak before each major release.

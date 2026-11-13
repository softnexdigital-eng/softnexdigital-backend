# softnexdigital-backend

## Super admin activity APIs

All endpoints below require a `SUPER_ADMIN` bearer token.

- `GET /api/dashboard/super-admin/page-visits?page=1&limit=20&slug=<slug>` lists storefront landing-page visits, newest first. The public `POST /api/public/page-view/:slug` endpoint records visits as well as incrementing the existing view count.
- `GET /api/dashboard/super-admin/notifications?limit=20` returns recent registration/order notifications and the global `unreadCount`.
- `PATCH /api/dashboard/super-admin/notifications/:id/read` marks one notification read.
- `PATCH /api/dashboard/super-admin/notifications/mark-all-read` marks all notifications read.

The admin UI can poll the notifications endpoint and use `unreadCount` to show a badge or blink indicator in the sidebar.

## Tenant Meta Pixel and Conversions API

Each store manages its own Meta setup with its authenticated tenant account. Apply the migration and regenerate Prisma Client before deploying:

```sh
npx prisma migrate deploy
npx prisma generate
```

Set `META_CAPI_ENCRYPTION_KEY` to a persistent, randomly generated 32-byte key encoded as 64 hexadecimal characters. For example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never commit the generated key or change it without first re-encrypting stored tokens. Set `META_GRAPH_API_VERSION` to a currently supported Graph API version.

Store settings API (Bearer token required):

- `GET /api/marketing/meta/settings` returns the tenant's Pixel ID, enabled state, and whether a CAPI token is configured. It never returns the token.
- `PUT /api/marketing/meta/settings` accepts `{ "pixelId": "123456789012345", "accessToken": "<Meta CAPI token>", "enabled": true }`. Omit `accessToken` to retain the saved value; use `"clearAccessToken": true` to remove it. Tokens are encrypted with AES-256-GCM before database storage.
- `POST /api/marketing/meta/test` accepts `{ "testEventCode": "<Events Manager test code>", "eventSourceUrl": "https://store.example/" }` and sends a `TestEvent`.

Public storefront API:

- `GET /api/marketing/meta/config/:slug` returns only the enabled Pixel ID and a `serverTrackingEnabled` flag for a published, active store.
- `POST /api/marketing/meta/events` accepts an allowed event (`ViewContent`, `AddToCart`, or `InitiateCheckout`), `tenantSlug`, a unique `eventId`, `eventSourceUrl`, `consent: true`, and either one `productId`/`quantity` or an `items` array of `{ "productId", "quantity" }`. Product IDs, names, prices, and currency are resolved from that tenant's database records.
- `POST /api/public/orders` sends a `Purchase` CAPI event only when `marketingConsent: true` is included. The returned `orderId` is the event ID; use that same ID for the browser Pixel `Purchase` event so Meta can deduplicate the browser and server copies. `eventSourceUrl`, `fbp`, and `fbc` can also be supplied with consent.

The public event endpoint requires explicit marketing consent and is rate limited. Email and phone values used for Purchase matching are normalized and SHA-256 hashed server-side; raw values are not stored in Meta event logs. Meta event delivery failures do not fail an order. Failed events are recorded; a retry of a public product event can reuse its event ID. Purchase delivery currently has no automatic retry.

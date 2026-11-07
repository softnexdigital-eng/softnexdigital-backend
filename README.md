# softnexdigital-backend

## Super admin activity APIs

All endpoints below require a `SUPER_ADMIN` bearer token.

- `GET /api/dashboard/super-admin/page-visits?page=1&limit=20&slug=<slug>` lists storefront landing-page visits, newest first. The public `POST /api/public/page-view/:slug` endpoint records visits as well as incrementing the existing view count.
- `GET /api/dashboard/super-admin/notifications?limit=20` returns recent registration/order notifications and the global `unreadCount`.
- `PATCH /api/dashboard/super-admin/notifications/:id/read` marks one notification read.
- `PATCH /api/dashboard/super-admin/notifications/mark-all-read` marks all notifications read.

The admin UI can poll the notifications endpoint and use `unreadCount` to show a badge or blink indicator in the sidebar.

# Product media and secure image delivery

Phase 3C v1.0 baseline — 2026-09-22, amended 2026-10-04 for the approved Phase 3O ultra-lean production profile. Local development retains Redis and the original private local/S3 paths. Production R2 uses a narrowly scoped signed application upload endpoint; no image SaaS or remote URL importer was added.

## Upload and processing

1. An owner with `media.manage`, a current MFA session and CSRF proof requests an intent with product UUID, optional same-product variant UUID, MIME, exact byte count, SHA-256, meaningful alt text and position. Maximum 30 current images per product. Object keys are generated; caller paths/filenames are not storage identifiers.
2. Local storage returns a relative signed multipart route valid for ten minutes. It still requires staff authentication/permission and CSRF. Size/checksum must match the intent.
3. Ordinary S3 may return the original signed POST policy, which fixes bucket, opaque key, content type, declared hash metadata and exact size. Cloudflare R2 does not support POST policies. In the approved Render profile `CATALOG_UPLOAD_TRANSPORT=proxy` returns a signed, authenticated application POST instead; PHP validates exact size and SHA-256, then writes to the private bucket without ACL headers. The request is bounded by the 10 MiB rule and 12 MiB ingress/PHP ceilings.
4. Completion verifies object existence/size and transactionally marks `processing` with an audit event. A media job on the configured queue inspects actual bytes/checksum/MIME/dimensions and fully decodes the image. Claimed MIME or signed metadata is not trusted as content proof.
5. Only decoded and re-encoded derivatives become `ready`. Invalid content becomes `rejected`; exhausted processing failures also reject safely. Completion replay of ready/processing state does not create another logical ready event. Interrupted dispatch/processing is recoverable from durable metadata by maintenance.

Allowlist: JPEG, PNG, WebP. Maximum original 10 MiB (10,485,760 bytes), 25 million pixels, positive dimensions and maximum 16,000 on either axis. SVG, HTML, executables, incorrect hashes, malformed/truncated images and declared pixel bombs are rejected. The source is read with a byte cap before decode. Worker decode has a 256 MiB limit, 60-second timeout, three attempts and 30-second retry backoff. The ultra-lean production worker is single-threaded and serves media after higher-priority queues; measure identity/payment delay.

GD re-encodes WebP at quality 82, bounded widths 320/640/1280 without upscaling, preserving alpha and stripping original metadata/trailing content. Actual duplicate widths are deduplicated in delivery. Orientation/art direction and final crop choices require content acceptance; no AVIF, animation preservation or arbitrary requested transforms are promised.

## Storage and access

Metadata contains the approved object key, derivatives object, dimensions, MIME/bytes/hash, product/variant association, alt text, position, timestamps and lifecycle state. Binaries are never stored in PostgreSQL. Original and derivative objects remain private on both local and S3 disks.

`GET /api/v1/media/{id}/{320|640|1280}` is the controlled media origin. It accepts only a metadata ID and fixed size; no caller-selected key, remote host or URL. A ready image of a publicly visible product is served with immutable cache headers. A draft/otherwise hidden product requires the existing trusted-origin/current-session/MFA/catalog-read checks; those previews use same-origin paths and no-store. Rejected/retired media is inaccessible. Public resource URLs may use the configured owned HTTPS CDN origin, which must proxy this controlled route. **Never configure a publicly readable bucket/prefix as the CDN origin.** The API enforces visibility before reading private storage.

Admin resources use private preview paths even when a CDN is configured. Raw quarantine keys, original files and signing credentials are absent from product resources. Previously public immutable bytes may remain in browser/CDN caches after archival or retirement; publication removal hides current references, not historical public copies. Configure CDN purge/retention operations before launch when removal is needed.

Display order is nonnegative position, then UUID; first ready image is the primary-image equivalent. Replacement is a new intent with a new immutable media identity. A published product's last ready image cannot be retired until a ready replacement exists. Archiving a product preserves its media/history; no catalog command hard-deletes the product.

## Recovery and cleanup

`catalog:media-maintenance` is scheduled hourly with overlap protection:

- Redispatch processing metadata older than 15 minutes. Per-image queue overlap locks and status checks make repeat delivery safe.
- Under the catalog lock, recheck and retire quarantined intents older than one day, with an atomic service audit and explicit expiry reason.
- After seven days of retirement/rejection, delete only that UUID's unique original/derivative keys, including deterministic partial outputs. Retain metadata/audit and retry failed deletions on later runs.

No listing-based bucket sweep can delete newly processing or valid shared objects. Keys are never shared across image rows. Terminal media cannot be restored through the API; cleanup is therefore compatible with delayed deletion. Seven days is an engineering recovery default; final storage retention/versioning and lifecycle policies require deployment approval. Object-store/queue failures are not swallowed as successful processing. Bucket operations are outside DB transactions.

## Running and deployment configuration

For local API testing use `scripts/serve-backend.sh --env=testing` (or omit the testing argument for the local DB). It validates PHP 8.5 and loads `backend/runtime/php/catalog.ini` alongside normal extensions, so the 10 MiB upload limit works rather than PHP's default 2 MiB upload/8 MiB request limits.

```sh
# From backend, with PHP 8.5 and the correct environment:
php artisan queue:work redis --queue=media --timeout=60 --tries=3 --memory=256
php artisan schedule:work
php artisan catalog:media-maintenance
```

Use the supervised worker and `schedule:work` in the same approved Render web container. PHP/FPM and ingress request limits must support a 10 MiB file plus multipart overhead (12 MiB request limit supplied); keep GD/fileinfo enabled and patched. Local Redis queue block polling remains two seconds below its three-second socket timeout. Production database queue uses three-second idle sleep.

Production needs `CATALOG_DISK=s3`, `CATALOG_UPLOAD_TRANSPORT=proxy` for R2, private bucket credentials/configuration, an owned HTTPS `CATALOG_MEDIA_ORIGIN`, matched private `CATALOG_INTERNAL_READ_KEY` in Next/API, TLS origin rules, shared web/worker scoped credentials, supervised queue/scheduler and storage recovery procedures. Local files are development-only, never permanent application-container storage.

The suite verifies the original signed S3 POST policy offline with synthetic credentials and tests the database-queued derivative job locally. **No real R2 vendor, bucket recovery or provider CORS integration has been exercised.** Before production, verify signed application upload, exact-size/hash rejection, private-object access, controlled-origin routing, lifecycle/versioning, interrupted uploads and recovery against R2. The R2 path does not require a POST-policy capable vendor; live provider evidence remains a launch gate.

Product photography, image ownership/licensing, asset supply and final visual acceptance remain Q31/P08 responsibilities to assign; test images are not launch assets.

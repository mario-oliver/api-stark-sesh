# Dog photos on S3 (presigned upload + view)

Stark Health stores dog profile images in a **private** S3 bucket. The browser never sees AWS keys.

1. **Upload:** `POST /v1/uploads/dog-photo/presign` → presigned **PUT** URL → browser uploads directly to S3.
2. **Save:** `POST /v1/dogs` with `photoKey` (S3 object key).
3. **Display:** API returns `photoUrl` as a presigned **GET** URL whenever dog data is loaded.

## API environment variables

```bash
AWS_REGION=us-east-1
S3_BUCKET_DOG_PHOTOS=stark-health
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Optional:
# S3_DOG_PHOTO_PREFIX=dog-photos
# S3_PRESIGN_UPLOAD_EXPIRES_SEC=900
# S3_PRESIGN_VIEW_EXPIRES_SEC=3600
```

Restart the API after changing `.env`.

## 1. S3 bucket

1. Create a bucket (e.g. `stark-health`) in the same region as `AWS_REGION`.
2. **Block all public access:** ON (default). Objects are only reachable via presigned URLs.
3. **Bucket versioning:** optional.
4. **Encryption:** SSE-S3 (default) is fine.

### CORS (required for browser upload)

S3 → bucket → **Permissions** → **Cross-origin resource sharing (CORS)**:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://YOUR_PRODUCTION_APP_DOMAIN"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Without this, the browser PUT after presign fails with a network/CORS error.

## 2. IAM policy

Create an IAM **user** or **role** used only by the API (not the frontend). Attach a policy like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DogPhotosListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::stark-health",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["dog-photos/*"]
        }
      }
    },
    {
      "Sid": "DogPhotosObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::stark-health/dog-photos/*"
    }
  ]
}
```

Replace `stark-health` with your bucket name. If you change `S3_DOG_PHOTO_PREFIX`, update the `dog-photos` path segments.

### Minimum actions

| Action        | Used for                          |
|---------------|-----------------------------------|
| `s3:PutObject`| Presigned PUT (upload)            |
| `s3:GetObject`| Presigned GET (display in app)    |
| `s3:ListBucket`| Optional; prefix condition above |

Do **not** grant `s3:*` or public read on the bucket.

## 3. Access keys for local dev

1. IAM → Users → your API user → **Security credentials** → **Create access key**.
2. Copy `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` into `api-stark-sesh/.env`.
3. Never commit these values or expose them to the Next.js app.

In production, prefer an **IAM role** on ECS/Lambda/EC2 and omit static keys (the SDK will use the role automatically if you remove explicit credentials from code later).

## 4. Verify

1. Start API and frontend.
2. Onboarding → pick a photo.
3. In API logs: `POST /v1/uploads/dog-photo/presign` → **200**.
4. In browser Network tab: **PUT** to `https://stark-health.s3.us-east-1.amazonaws.com/...` → **200**.
5. Complete onboarding; dog card should show the image (`photoUrl` is a long presigned GET URL).

### Common failures

| Symptom | Fix |
|---------|-----|
| API 503 on presign | Set all four env vars; restart API |
| API 403/400 on presign | IAM missing `PutObject` / `GetObject` on `dog-photos/*` |
| Browser “Network Error” on PUT | Add CORS `AllowedOrigins` for your frontend URL **and** `127.0.0.1` if you open the app that way; allow `PUT` |
| PUT 403 | Wrong IAM, wrong bucket, or `Content-Type` header doesn’t match presign |
| Image broken after save | `GetObject` denied, or upload PUT failed silently—check Network tab |

## Object layout

```
s3://stark-health/dog-photos/{clerkUserId}/{uuid}.jpg
```

Keys are validated so users can only attach keys under their own `dog-photos/{userId}/` prefix.

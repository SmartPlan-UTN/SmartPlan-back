# Media galleries

Images are stored as WebP objects in a private S3 bucket. The API stores opaque
object keys and streams bytes only after checking access to the parent resource.
Clients must use the authenticated API client for private media URLs; an HTML
`img` request does not carry the Bearer token.

## Contract

Uploads use multipart form data with a `file` field. JPEG, PNG, and WebP are
accepted only when the declared MIME type matches the actual file format.
Maximum input size is 5 MB. An activity, place, or plan may have 10 images; a
rating or feedback may have 5; a user has one current avatar. The image and
avatar upload responses contain `{ id, url, createdAt }`; gallery image
responses also contain `isPrimary` and `displayOrder`. Image URLs are relative
paths beginning with `/api/media/`.

| Operation | Route |
| --- | --- |
| Replace/remove own avatar | `PUT`/`DELETE /users/me/avatar` |
| Upload gallery image | `POST /activities/:id/images`, `/places/:id/images`, `/plans/:id/images`, `/ratings/:id/images`, or `/feedback/:id/images` |
| Change cover/order or soft delete | `PATCH`/`DELETE /:target/:id/images/:imageId` |
| List resource images | `GET /media/:target/:id/images` |
| Download image/avatar | `GET /media/:target/:imageId`, `GET /media/avatar/:imageId` |

`PATCH` accepts optional `isPrimary: boolean` and `displayOrder: integer` from
0 to 99. `displayOrder` is a target zero-based position; the API reindexes the
other images in a transaction. Promoting a cover clears the previous cover in
that transaction. Deleting the cover promotes the first remaining image.

Activity and place management requires an administrator. Plan management
requires its owner or an administrator. Rating management requires its author
or an administrator. Feedback management requires the outing owner or an
administrator. Activity/place images and approved-rating images are public;
pending or rejected rating images are visible only to the author or an
administrator. Feedback images are private to the outing owner and
administrators. Public plan images require a public plan; owners and
administrators may read private plan images. Avatar images are public.

An outing copies the plan's image rows when it copies the itinerary. The rows
refer to the same immutable S3 object keys, while subsequent gallery changes
are independent. Plan cards use the plan cover, then the first itinerary
activity image, then `null`. This selection also applies to outing cards.

Input and access errors use HTTP `400` (invalid input or gallery limit), `403`
(forbidden), `404` (missing parent/image), `413` (multipart size limit), and
`415` (unsupported or falsified image format). Missing S3 configuration returns
`503`. A failed object write never creates a gallery row.

The migration `1789700000000-AddMediaGalleries` creates the six media tables
after `1789600000000-SeparatePlansAndOutings`. Database e2e verification needs
the isolated `smartplan_test` PostgreSQL instance.

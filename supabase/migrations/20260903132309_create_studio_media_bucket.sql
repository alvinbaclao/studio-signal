-- Group 3 of the deficiencies backlog: no Supabase Storage bucket existed
-- for this project at all (Deficiency #2), blocking profile photo upload
-- (CompleteProfile), Media library uploads (MediaUploadComposer, Task 18),
-- and Bulletin media attachment (Deficiency #28). Confirmed zero rows in
-- storage.buckets and zero policies on storage.objects before this.
--
-- Path convention (all under one private bucket, "studio-media"):
--   {studio_id}/people/{person_id}/{filename}   -> person.photo_path
--   {studio_id}/studio-logo/{filename}           -> studio.logo_path
--   {studio_id}/media/{filename}                 -> media_item.storage_path
-- RLS reads the studio_id straight out of the first path segment via
-- storage.foldername(name)[1] — every one of these paths starts with the
-- uploading person's own studio_id, so this is the same "which studio can
-- I act in" boundary as every other RLS policy in this project, just
-- expressed against a file path instead of a foreign key column.
--
-- Private (not public): this bucket holds photos of dancers, some of them
-- minors, so a guessable/public URL is not acceptable — reads are
-- authenticated + RLS-gated via createSignedUrl(), same posture as every
-- other table in this schema. Uses app.my_confirmed_studio_ids() (added
-- fixing the pending-content-leak, Deficiency #42) for the same reason it
-- was added there: a pending/unvetted person should not see real studio
-- content, and photos/media are exactly that.
--
-- INSERT/UPDATE are scoped coarsely (any confirmed person, their own
-- studio's folder) rather than replicating each table's fine-grained
-- authorization (Director/instructor-for-media, self/guardian-for-photo)
-- at the storage layer. That fine-grained check still happens for real,
-- just one level up: the authoritative pointer (person.photo_path,
-- media_item.storage_path) is written through person_update/media_insert,
-- which already enforce it. A stray object uploaded into someone else's
-- folder without updating their pointer row does nothing — the app never
-- reads a path that isn't referenced from a real, RLS-protected row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio-media',
  'studio-media',
  false,
  52428800, -- 50MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

drop policy if exists studio_media_select on storage.objects;
create policy studio_media_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'studio-media'
  and (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
);

drop policy if exists studio_media_insert on storage.objects;
create policy studio_media_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'studio-media'
  and (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
);

drop policy if exists studio_media_update on storage.objects;
create policy studio_media_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'studio-media'
  and (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
)
with check (
  bucket_id = 'studio-media'
  and (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
);

drop policy if exists studio_media_delete on storage.objects;
create policy studio_media_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'studio-media'
  and (
    app.is_director((storage.foldername(name))[1]::uuid)
    or owner = auth.uid()
  )
);

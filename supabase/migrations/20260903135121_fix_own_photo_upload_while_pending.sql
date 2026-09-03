-- Found live-verifying Group 3: a person completing CompleteProfile (the
-- one-time "tell us about you" step every fresh redeem_invite/
-- redeem_join_code lands on) is still status='pending' at that point —
-- the Director hasn't confirmed them yet. But the original studio-media
-- policies required app.my_confirmed_studio_ids() for every write,
-- so a brand-new person could never upload their own profile photo during
-- onboarding. Confirmed live: real "Something went wrong uploading that
-- photo" error for a genuinely-pending self-serve signup.
--
-- This is a real, legitimate case the original design didn't account for
-- (as opposed to Deficiency #42's leak, which was a real gap to close) —
-- a person should always be able to write their own {studio_id}/people/
-- {their own person_id}/... path, any status, since it's their own data,
-- not studio content. Every other path (studio-logo, media) keeps the
-- confirmed-only requirement from the original migration — this only
-- widens the one category that needed it.

drop policy if exists studio_media_select on storage.objects;
create policy studio_media_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'studio-media'
  and (
    ((storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3]::uuid in (select app.my_person_ids()))
    or (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
  )
);

drop policy if exists studio_media_insert on storage.objects;
create policy studio_media_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'studio-media'
  and (
    ((storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3]::uuid in (select app.my_person_ids()))
    or (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
  )
);

drop policy if exists studio_media_update on storage.objects;
create policy studio_media_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'studio-media'
  and (
    ((storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3]::uuid in (select app.my_person_ids()))
    or (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
  )
)
with check (
  bucket_id = 'studio-media'
  and (
    ((storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3]::uuid in (select app.my_person_ids()))
    or (storage.foldername(name))[1]::uuid in (select app.my_confirmed_studio_ids())
  )
);

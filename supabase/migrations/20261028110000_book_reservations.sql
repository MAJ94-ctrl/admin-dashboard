create table if not exists public.book_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  book_id uuid not null references public.books (id) on delete restrict,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 120),
  customer_email text not null check (char_length(customer_email) <= 254),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 40),
  quantity integer not null check (quantity between 1 and 99),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.book_reservations
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.book_reservations
  alter column user_id drop not null;

create index if not exists book_reservations_user_created_idx
  on public.book_reservations (user_id, created_at desc);

create index if not exists book_reservations_book_created_idx
  on public.book_reservations (book_id, created_at desc);

create or replace function public.is_bookshop_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false);
$$;

grant execute on function public.is_bookshop_admin() to anon, authenticated;
grant select on public.books to anon, authenticated;
grant insert, update, delete on public.books to authenticated;
grant select on public.book_reservations to authenticated;
revoke insert (user_id) on public.book_reservations from anon, authenticated;
grant insert (
  book_id,
  customer_name,
  customer_email,
  customer_phone,
  quantity,
  note
) on public.book_reservations to anon, authenticated;
grant update (status, updated_at) on public.book_reservations to authenticated;

alter table public.book_reservations enable row level security;

drop policy if exists "Customers can create their own reservations"
  on public.book_reservations;
drop policy if exists "Anyone can submit a reservation request"
  on public.book_reservations;
create policy "Anyone can submit a reservation request"
  on public.book_reservations
  for insert
  to anon, authenticated
  with check (user_id is null);

drop policy if exists "Customers can view their own reservations"
  on public.book_reservations;

drop policy if exists "Reservations insert is limited to owner or admin"
  on public.book_reservations;
create policy "Reservations insert is limited to owner or admin"
  on public.book_reservations
  as restrictive
  for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id or public.is_bookshop_admin());

drop policy if exists "Anyone can view listed approved books"
  on public.books;
create policy "Anyone can view listed approved books"
  on public.books
  for select
  to anon, authenticated
  using (
    is_listed
    and moderation_status = 'approved'
    and not contains_nudity
  );

drop policy if exists "Bookshop admins can manage books" on public.books;
create policy "Bookshop admins can manage books"
  on public.books
  for all
  to authenticated
  using (public.is_bookshop_admin())
  with check (public.is_bookshop_admin());

drop policy if exists "Books select is limited to catalog or admins" on public.books;
create policy "Books select is limited to catalog or admins"
  on public.books
  as restrictive
  for select
  to anon, authenticated
  using (
    public.is_bookshop_admin()
    or (
      is_listed
      and moderation_status = 'approved'
      and not contains_nudity
    )
  );

drop policy if exists "Only admins can insert books" on public.books;
create policy "Only admins can insert books"
  on public.books
  as restrictive
  for insert
  to authenticated
  with check (public.is_bookshop_admin());

drop policy if exists "Only admins can update books" on public.books;
create policy "Only admins can update books"
  on public.books
  as restrictive
  for update
  to authenticated
  using (public.is_bookshop_admin())
  with check (public.is_bookshop_admin());

drop policy if exists "Only admins can delete books" on public.books;
create policy "Only admins can delete books"
  on public.books
  as restrictive
  for delete
  to authenticated
  using (public.is_bookshop_admin());

drop policy if exists "Bookshop admins can view all reservations"
  on public.book_reservations;
create policy "Bookshop admins can view all reservations"
  on public.book_reservations
  for select
  to authenticated
  using (public.is_bookshop_admin());

drop policy if exists "Reservations select is limited to owner or admin"
  on public.book_reservations;
create policy "Reservations select is limited to owner or admin"
  on public.book_reservations
  as restrictive
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_bookshop_admin());

drop policy if exists "Bookshop admins can update reservations"
  on public.book_reservations;
create policy "Bookshop admins can update reservations"
  on public.book_reservations
  for update
  to authenticated
  using (public.is_bookshop_admin())
  with check (public.is_bookshop_admin());

drop policy if exists "Only admins can update reservations"
  on public.book_reservations;
create policy "Only admins can update reservations"
  on public.book_reservations
  as restrictive
  for update
  to authenticated
  using (public.is_bookshop_admin())
  with check (public.is_bookshop_admin());

# Paper & Pine Bookshop

The customer storefront and `/admin` bookseller dashboard are built with React
and Tailwind CSS. The Express API in `index.js` connects both experiences to
Supabase and enforces authentication and database row-level security.

## Run locally

1. Copy `.env.example` to `.env`. Set the Supabase URL and publishable key in
   both the server (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) and browser
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) settings. Only use the
   publishable/anon key in browser settings; never put a secret/service-role key
   in `VITE_*` variables.
2. Run `supabase/migrations/20261028110000_book_reservations.sql` in the
   Supabase SQL Editor. It creates reservation storage and policies for the
   public catalog, customer requests, and admin operations. If
   `book_reservations` already exists, rerun the full migration to add any
   missing columns required by the app.
3. Assign the trusted admin user's Supabase Auth `app_metadata` the claim
   `{"role":"admin"}`. This must be done through the Supabase dashboard or a
   trusted server-side admin process, never from the browser or user metadata.
   For example, in the Supabase SQL Editor, replace the email with the staff
   account:

   ```sql
   update auth.users
   set raw_app_meta_data =
     coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'bookseller@example.com';
   ```

   The staff member must sign out and back in to receive a token with the
   updated role.
4. Start the API with `npm run dev:server` (or `npm start`) and the frontend
   with `npm run dev`.
5. The API listens on `http://localhost:3200`; set `CORS_ORIGIN` and
   `VITE_API_URL` if the frontend and API run on different origins.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/api/catalog` | Public approved/listed catalog |
| `POST` | `/api/reservations` | Submit a customer request with an email address |
| `GET` | `/api/books` | Admin book inventory |
| `GET` | `/api/books/:id` | Admin book details |
| `POST` | `/api/books` | Add a book |
| `PATCH` | `/api/books/:id` | Edit a book |
| `DELETE` | `/api/books/:id` | Delete a book |
| `GET` | `/api/admin/reservations` | Admin reservation queue |
| `PATCH` | `/api/admin/reservations/:id` | Confirm or reject a pending request |

Every admin book and reservation route checks the verified Supabase
`app_metadata.role` claim and forwards the user's token, so Supabase Row Level
Security remains in force. The API does not use a service-role key or bypass
RLS.

The storefront exposes only approved, listed books that do not contain nudity.
Customers do not need an account or sign-in. They provide their name and email
when submitting a request. Requests are stored with a `pending` status without
deducting stock; only admins can view the requests and confirm or decline them
in `/admin`.
# admin-dashboard
# admin-dashboard

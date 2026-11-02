import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3200').replace(
  /\/$/,
  '',
)
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: true, persistSession: true },
      })
    : null
const isAdminRoute = window.location.pathname.startsWith('/admin')
const bookFields = [
  ['title', 'Title', 'text', true],
  ['author', 'Author', 'text'],
  ['isbn', 'ISBN', 'text'],
  ['genre', 'Genre', 'text'],
  ['publisher', 'Publisher', 'text'],
  ['published_on', 'Publication date', 'date'],
  ['cover_image_url', 'Cover image URL', 'url'],
  ['price', 'Price', 'number', true],
  ['stock_quantity', 'Stock quantity', 'number', true],
]

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

async function getAccessToken({ forceRefresh = false } = {}) {
  if (!supabase) throw new Error('Supabase is not configured for this application.')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session?.access_token) {
    throw new Error('Your session expired. Please sign in again.')
  }

  const expiresSoon =
    (data.session.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 60
  if (!forceRefresh && !expiresSoon) return data.session.access_token

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    throw new Error(`Your admin session could not be refreshed: ${refreshError.message}`)
  }
  if (!refreshed.session?.access_token) {
    throw new Error('Your session expired. Please sign in again.')
  }
  return refreshed.session.access_token
}

async function apiRequest(path, { method = 'GET', body, retryAuth = true } = {}) {
  const token = await getAccessToken()
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (response.status === 401) {
    if (retryAuth) {
      await getAccessToken({ forceRefresh: true })
      return apiRequest(path, { method, body, retryAuth: false })
    }
    throw new Error('Your admin session is no longer valid. Sign out and sign in again.')
  }
  return readApiResponse(response)
}

async function publicApiRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return readApiResponse(response)
}

async function readApiResponse(response) {
  const responseText = await response.text()
  let result = null
  if (responseText) {
    try {
      result = JSON.parse(responseText)
    } catch {
      throw new Error('The server returned an invalid response. Please try again.')
    }
  }
  if (!response.ok) {
    throw new Error(result?.error || `The request failed (${response.status}).`)
  }
  return result
}

async function loadAdminData() {
  const [booksResult, reservationsResult] = await Promise.allSettled([
    apiRequest('/api/books'),
    apiRequest('/api/admin/reservations'),
  ])
  const errors = []

  if (booksResult.status === 'rejected') {
    errors.push(`Could not load books: ${booksResult.reason.message}`)
  }
  if (reservationsResult.status === 'rejected') {
    errors.push(`Could not load requests: ${reservationsResult.reason.message}`)
  }

  return {
    books: booksResult.status === 'fulfilled' ? booksResult.value : null,
    reservations:
      reservationsResult.status === 'fulfilled' ? reservationsResult.value : null,
    error: errors.join(' '),
  }
}

function Brand({ light = false }) {
  return (
    <a
      href={isAdminRoute ? '/' : '#top'}
      className={classNames(
        'inline-flex items-center gap-3 font-semibold tracking-[0.16em] no-underline',
        light ? 'text-white' : 'text-[#26372d]',
      )}
      aria-label="Paper and Pine home"
    >
      <span className="grid size-10 place-items-center rounded-full bg-[#45694f] font-display text-xl italic text-white">
        P
      </span>
      <span className="text-sm">PAPER <i className="font-display font-normal">&</i> PINE</span>
    </a>
  )
}

function AdminLoginDialog({ onClose, onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (!supabase) {
      setError('Sign-in is not configured. Set the VITE Supabase settings.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await supabase.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (result.data.session) {
        onSignedIn(result.data.session.user)
        onClose()
      }
    } catch (authError) {
      setError(authError.message || 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#17241b]/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-heading"
        className="relative my-auto w-full max-w-md rounded-2xl bg-[#fbfaf6] p-7 shadow-2xl sm:p-9"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-3 rounded-full px-3 py-1 text-2xl text-stone-500 hover:bg-stone-100"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
        <p className="text-xs font-bold tracking-[0.2em] text-[#627a65]">PAPER & PINE</p>
        <h2 id="auth-heading" className="mt-3 font-display text-3xl text-[#26372d]">
          Bookseller sign in
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Sign in with your admin account to manage books and customer requests.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <FormInput
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FormInput
            label="Password"
            type="password"
            autoComplete="current-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#365640] px-4 py-3 text-sm font-semibold text-white hover:bg-[#294632] disabled:opacity-60"
          >
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  )
}

function FormInput({ label, className = '', ...props }) {
  return (
    <label className={classNames('block space-y-1.5 text-sm font-medium text-stone-700', className)}>
      <span>{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-[#63846a] focus:ring-2 focus:ring-[#63846a]/20"
      />
    </label>
  )
}

function FormSelect({ label, children, ...props }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-stone-700">
      <span>{label}</span>
      <select
        {...props}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#63846a] focus:ring-2 focus:ring-[#63846a]/20"
      >
        {children}
      </select>
    </label>
  )
}

function BookCard({ book, onRequest }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e9e6db] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="relative grid h-64 place-items-center overflow-hidden bg-[#efeee6] p-5">
        {book.cover_image_url ? (
          <img
            className="h-full w-full rounded-md object-cover shadow-md"
            src={book.cover_image_url}
            alt={`Cover of ${book.title}`}
            loading="lazy"
          />
        ) : (
          <div className="flex h-52 w-36 flex-col items-center justify-center gap-3 rounded-sm bg-linear-to-br from-[#637d68] to-[#344b3b] p-4 text-center text-white shadow-xl odd:rotate-0">
            <span className="grid size-8 place-items-center rounded-full border border-white/60 font-display italic">P</span>
            <span className="font-display text-lg leading-tight">{book.title}</span>
            <span className="text-xs text-white/75">{book.author || 'A new discovery'}</span>
          </div>
        )}
        {book.genre && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs text-stone-700">
            {book.genre}
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-[#29382e]">{book.title}</h3>
            <p className="mt-1 text-sm text-stone-500">by {book.author || 'Unknown author'}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-[#45694f]">
            {money.format(Number(book.price))}
          </span>
        </div>
        {book.description && (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{book.description}</p>
        )}
        <button
          type="button"
          disabled={book.stock_quantity < 1}
          onClick={() => onRequest(book)}
          className="mt-5 flex w-full items-center justify-between border-t border-stone-100 pt-4 text-left text-sm font-semibold text-[#45694f] hover:text-[#886b40] disabled:cursor-not-allowed disabled:text-stone-400"
        >
          <span>
            {book.stock_quantity < 1
              ? 'Currently unavailable'
              : 'Request this book'}
          </span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  )
}

function ReservationDialog({ book, onClose, onSubmitted }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await publicApiRequest('/api/reservations', {
        method: 'POST',
        body: {
          book_id: book.id,
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim() || null,
          quantity: Number(quantity),
          note: note.trim() || null,
        },
      })
      onSubmitted()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#17241b]/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-heading"
        className="relative my-auto w-full max-w-lg rounded-2xl bg-[#fbfaf6] p-7 shadow-2xl sm:p-9"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="absolute right-4 top-3 rounded-full px-3 py-1 text-2xl text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="Close dialog">×</button>
        <p className="text-xs font-bold tracking-[0.2em] text-[#627a65]">BOOK REQUEST</p>
        <h2 id="request-heading" className="mt-3 font-display text-3xl text-[#26372d]">{book.title}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">Send your request to the bookseller. We’ll confirm availability before setting a copy aside.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <FormInput label="Your name" autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            <FormInput label="Quantity" type="number" min="1" max={Math.min(book.stock_quantity, 99)} required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <FormInput label="Email address" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <FormInput label="Phone (optional)" type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />
          <label className="block space-y-1.5 text-sm font-medium text-stone-700">
            <span>Note for the shop (optional)</span>
            <textarea rows="3" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#63846a] focus:ring-2 focus:ring-[#63846a]/20" />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#365640] px-4 py-3 text-sm font-semibold text-white hover:bg-[#294632] disabled:opacity-60">
            {busy ? 'Sending request…' : 'Send book request'}
          </button>
        </form>
      </section>
    </div>
  )
}

function Storefront({ isAdmin, onSwitchAdmin }) {
  const [books, setBooks] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All books')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestBook, setRequestBook] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    fetch(`${apiUrl}/api/catalog`)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load the catalog.')
        return result
      })
      .then((result) => {
        if (active) setBooks(result)
      })
      .catch((catalogError) => {
        if (active) setError(catalogError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const categories = useMemo(
    () => ['All books', ...new Set(books.map((book) => book.genre).filter(Boolean))],
    [books],
  )
  const visibleBooks = useMemo(() => {
    const text = query.trim().toLowerCase()
    return books.filter((book) => {
      const categoryMatch = category === 'All books' || book.genre === category
      const searchMatch =
        !text ||
        [book.title, book.author, book.genre, book.publisher]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(text))
      return categoryMatch && searchMatch
    })
  }, [books, category, query])

  return (
    <div id="top" className="min-h-screen bg-[#fbfaf6] text-[#28352c]">
      <div className="bg-[#355542] px-4 py-2 text-center text-xs tracking-wide text-white">
        Independent books, thoughtfully chosen <span className="hidden sm:inline">· A little more story in every day</span>
      </div>
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-8">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm text-stone-600 sm:flex">
          <a className="hover:text-[#365640]" href="#collection">The collection</a>
          <a className="hover:text-[#365640]" href="#about">Our shop</a>
        </nav>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              className="rounded-lg border border-[#9aab9a] px-3 py-2 text-xs font-semibold text-[#365640] hover:bg-[#eff1eb]"
              onClick={onSwitchAdmin}
            >
              Admin dashboard
            </button>
          )}
          {!isAdmin && (
            <a href="/admin" className="rounded-lg bg-[#365640] px-3 py-2 text-xs font-semibold text-white hover:bg-[#294632] sm:px-4">
              Admin sign in
            </a>
          )}
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-5 px-6 py-14 sm:px-10 md:min-h-117.5 md:grid-cols-2 md:py-16">
          <div className="max-w-xl">
            <p className="text-xs font-bold tracking-[0.22em] text-[#71806d]">A BOOKSHOP FOR THE CURIOUS</p>
            <h1 className="mt-5 font-display text-5xl leading-[1.08] tracking-tight text-[#29362d] sm:text-6xl">
              Find a story<br />that <em className="text-[#6b816b]">stays</em> with you.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-stone-600">
              Handpicked reads for slow mornings, late nights, and every little escape in between.
            </p>
            <a className="mt-7 inline-flex items-center gap-4 rounded-lg bg-[#355542] px-5 py-3 text-sm font-semibold text-white hover:bg-[#294632]" href="#collection">
              Explore the collection <span aria-hidden="true">↗</span>
            </a>
            <p className="mt-6 text-xs text-stone-500">✳ &nbsp; New stories added by our booksellers</p>
          </div>
          <div className="relative mx-auto flex h-72 w-full max-w-md items-end justify-center pb-5 sm:h-96">
            <div className="absolute right-8 top-2 size-60 rounded-full bg-[#e5dfc9] sm:right-12 sm:size-72" />
            <div className="absolute left-[12%] top-12 z-10 grid h-52 w-32 -rotate-12 place-items-center bg-[#647a62] p-4 text-center font-display text-lg leading-7 text-[#f3ead4] shadow-xl">
              THE ART OF<br />BEGINNING<br />AGAIN
            </div>
            <div className="absolute right-[13%] top-8 z-10 grid h-52 w-32 rotate-12 place-items-center bg-[#a87450] p-4 text-center font-display text-lg leading-7 text-[#f0eadc] shadow-xl">
              A FIELD<br />OF SMALL<br />WONDERS
            </div>
            <div className="z-20 flex h-56 w-40 rotate-2 flex-col items-center justify-center bg-[#e9d8bd] text-[#435b48] shadow-2xl">
              <span className="font-display text-xl italic">somewhere,</span>
              <strong className="font-display text-4xl font-medium">softly</strong>
              <i className="mt-3 text-[9px]">— stories for the soul —</i>
            </div>
            <span className="absolute bottom-0 right-1 text-xs italic text-stone-500">a quiet place to get lost</span>
          </div>
        </section>

        <section className="border-y border-[#e7e5dc] bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-16 gap-y-3 px-5 py-5 text-xs text-stone-600 sm:justify-between">
            <span>✳ &nbsp; Chosen with care</span><span>✺ &nbsp; Stories for every season</span><span>♡ &nbsp; Always a little personal</span>
          </div>
        </section>

        <section id="collection" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-[#71806d]">THE BOOKSHELF</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight text-[#29362d]">
                Good books, <em className="text-[#6b816b]">good company.</em>
              </h2>
              <p className="mt-2 text-sm text-stone-500">Browse the latest finds selected by our booksellers.</p>
            </div>
            <label className="flex h-11 w-full items-center gap-3 rounded-lg border border-stone-300 bg-white px-3 md:max-w-xs">
              <span aria-hidden="true" className="text-xl text-stone-500">⌕</span>
              <input className="w-full border-0 bg-transparent text-sm outline-none" type="search" placeholder="Search title or author" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search books" />
            </label>
          </div>
          <div className="my-7 flex gap-2 overflow-x-auto pb-2">
            {categories.map((item) => (
              <button key={item} type="button" onClick={() => setCategory(item)} className={classNames('shrink-0 rounded-full border px-4 py-2 text-xs transition', category === item ? 'border-[#355542] bg-[#355542] text-white' : 'border-stone-300 text-stone-600 hover:border-[#355542] hover:text-[#355542]')}>
                {item}
              </button>
            ))}
          </div>
          {loading && <div className="grid min-h-48 place-items-center text-sm text-stone-500">Finding your next favorite…</div>}
          {!loading && error && <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800" role="alert">{error}</div>}
          {!loading && !error && visibleBooks.length === 0 && (
            <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 text-center text-sm text-stone-500">
              {books.length === 0 ? 'No books are currently published. Please check back soon.' : 'No books match your search.'}
            </div>
          )}
          {!loading && !error && visibleBooks.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleBooks.map((book) => (
                <BookCard key={book.id} book={book} onRequest={setRequestBook} />
              ))}
            </div>
          )}
        </section>

        <section id="about" className="bg-[#344b3b] px-6 py-14 text-white sm:px-10">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-[#c1ceb9]">A NOTE FROM THE BOOKSELLER</p>
              <h2 className="mt-4 font-display text-4xl leading-tight">Books make room<br />for <em className="text-[#d6c6a9]">more life.</em></h2>
            </div>
            <p className="text-sm leading-7 text-[#d1d9cd]">
              Find a title you love? Send a request with your email address. Our bookseller will review it and contact you to confirm availability.
            </p>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-stone-500 sm:px-8">
        <Brand />
        <span>Made for readers, wherever you are.</span>
        <a href="#collection" className="hover:text-[#355542]">Back to the bookshelf ↑</a>
      </footer>
      {requestBook && (
        <ReservationDialog
          book={requestBook}
          onClose={() => setRequestBook(null)}
          onSubmitted={() => {
            setRequestBook(null)
            setNotice('Your book request was sent to the bookseller.')
            window.setTimeout(() => setNotice(''), 4500)
          }}
        />
      )}
      {notice && <div role="status" className="fixed bottom-5 right-5 z-40 max-w-sm rounded-xl bg-[#344b3b] px-5 py-4 text-sm text-white shadow-xl">{notice}</div>}
    </div>
  )
}

function emptyBook() {
  return {
    title: '',
    author: '',
    isbn: '',
    genre: '',
    publisher: '',
    published_on: '',
    description: '',
    cover_image_url: '',
    price: '0',
    stock_quantity: '0',
    contains_nudity: false,
    moderation_status: 'pending',
    is_listed: false,
  }
}

function BookEditor({ book, onClose, onSaved }) {
  const [form, setForm] = useState(() => (book ? {
    ...emptyBook(),
    title: book.title,
    author: book.author || '',
    isbn: book.isbn || '',
    genre: book.genre || '',
    publisher: book.publisher || '',
    description: book.description || '',
    cover_image_url: book.cover_image_url || '',
    contains_nudity: book.contains_nudity,
    moderation_status: book.moderation_status,
    is_listed: book.is_listed,
    price: String(book.price),
    stock_quantity: String(book.stock_quantity),
    published_on: book.published_on || '',
  } : emptyBook()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(book)

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (form.is_listed && (form.moderation_status !== 'approved' || form.contains_nudity)) {
      setError('A book must be approved and have no nudity to be listed.')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      author: form.author.trim() || null,
      isbn: form.isbn.trim() || null,
      genre: form.genre.trim() || null,
      publisher: form.publisher.trim() || null,
      published_on: form.published_on || null,
      description: form.description.trim() || null,
      cover_image_url: form.cover_image_url.trim() || null,
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
    }
    try {
      await apiRequest(isEditing ? `/api/books/${book.id}` : '/api/books', {
        method: isEditing ? 'PATCH' : 'POST',
        body: payload,
      })
      onSaved()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="book-editor-title" className="my-auto max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-emerald-800">BOOK INVENTORY</p>
            <h2 id="book-editor-title" className="mt-2 font-display text-3xl text-slate-900">{isEditing ? 'Edit book' : 'Add a book'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-2xl text-slate-500 hover:bg-slate-100" aria-label="Close">×</button>
        </div>
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {bookFields.map(([key, label, type, required]) => (
            <FormInput
              key={key}
              className={key === 'title' || key === 'cover_image_url' ? 'sm:col-span-2' : ''}
              label={label}
              type={type}
              required={required}
              min={type === 'number' ? '0' : undefined}
              step={key === 'price' ? '0.01' : key === 'stock_quantity' ? '1' : undefined}
              value={form[key]}
              onChange={(event) => update(key, event.target.value)}
            />
          ))}
          <label className="space-y-1.5 text-sm font-medium text-stone-700 sm:col-span-2">
            <span>Description</span>
            <textarea rows="3" value={form.description} onChange={(event) => update('description', event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
          </label>
          <FormSelect label="Moderation status" value={form.moderation_status} onChange={(event) => update('moderation_status', event.target.value)}>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </FormSelect>
          <div className="space-y-3 self-end pb-2">
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={form.contains_nudity} onChange={(event) => update('contains_nudity', event.target.checked)} className="size-4 accent-emerald-800" />
              Contains nudity
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={form.is_listed} onChange={(event) => update('is_listed', event.target.checked)} className="size-4 accent-emerald-800" />
              Show on customer catalog
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-stone-200 pt-5 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50">Cancel</button>
            <button disabled={saving} type="submit" className="rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60">{saving ? 'Saving…' : 'Save book'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function AdminDashboard({ user, onSignOut, onSwitchStorefront }) {
  const [section, setSection] = useState('books')
  const [books, setBooks] = useState([])
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorBook, setEditorBook] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [notice, setNotice] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    const result = await loadAdminData()
    if (result.books) setBooks(result.books)
    if (result.reservations) setReservations(result.reservations)
    setError(result.error)
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    loadAdminData()
      .then((result) => {
        if (!active) return
        if (result.books) setBooks(result.books)
        if (result.reservations) setReservations(result.reservations)
        setError(result.error)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const pendingCount = reservations.filter((item) => item.status === 'pending').length
  const listedCount = books.filter((book) => book.is_listed).length

  async function saveBook() {
    setEditorOpen(false)
    setEditorBook(null)
    setNotice('Book saved.')
    await refresh()
  }

  async function deleteBook(book) {
    if (!window.confirm(`Delete "${book.title}" from the bookshop?`)) return
    try {
      await apiRequest(`/api/books/${book.id}`, { method: 'DELETE' })
      setNotice('Book deleted.')
      await refresh()
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function updateReservation(reservation, status) {
    try {
      await apiRequest(`/api/admin/reservations/${reservation.id}`, {
        method: 'PATCH',
        body: { status },
      })
      setNotice(`Request ${status}.`)
      await refresh()
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const forbidden = /admin access is required/i.test(error)

  return (
    <div className="min-h-screen bg-[#f5f6f3] text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-360 items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-5">
            <Brand />
            <span className="hidden h-8 border-l border-slate-200 sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">Bookseller workspace</p>
              <p className="text-xs text-slate-500">Manage books and customer requests</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden max-w-48 truncate text-xs text-slate-500 md:inline">{user.email}</span>
            <button onClick={onSwitchStorefront} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Customer site</button>
            <button onClick={onSignOut} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-360 px-5 py-7 lg:px-8 lg:py-10">
        {!loading && forbidden ? (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 text-xl text-amber-800">!</span>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Admin access required</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This account is not assigned the admin role. Set its Supabase Auth <code>app_metadata.role</code> to <code>admin</code>, then sign out and back in.
            </p>
            <a href="/" className="mt-5 inline-flex rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">Return to customer site</a>
          </div>
        ) : (
          <>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Overview</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Good day, bookseller</h1>
                <p className="mt-1 text-sm text-slate-500">Here’s what’s happening at your bookshop.</p>
              </div>
              <button onClick={refresh} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh data</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total books" value={books.length} accent="bg-emerald-100 text-emerald-800" icon="▤" />
              <StatCard label="Visible in catalog" value={listedCount} accent="bg-sky-100 text-sky-800" icon="◉" />
              <StatCard label="Requests to review" value={pendingCount} accent="bg-amber-100 text-amber-800" icon="✉" />
            </div>

            <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex gap-2">
                  <button onClick={() => setSection('books')} className={classNames('rounded-lg px-4 py-2 text-sm font-medium', section === 'books' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>Books ({books.length})</button>
                  <button onClick={() => setSection('requests')} className={classNames('rounded-lg px-4 py-2 text-sm font-medium', section === 'requests' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                    Requests {pendingCount > 0 && <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-xs text-amber-900">{pendingCount}</span>}
                  </button>
                </div>
                {section === 'books' && (
                  <button onClick={() => { setEditorBook(null); setEditorOpen(true) }} className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900">+ Add a book</button>
                )}
              </div>

              {error && !forbidden && <div role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
              {loading ? (
                <div className="grid min-h-56 place-items-center text-sm text-slate-500">Loading your workspace…</div>
              ) : section === 'books' ? (
                <BooksTable books={books} onEdit={(book) => { setEditorBook(book); setEditorOpen(true) }} onDelete={deleteBook} />
              ) : (
                <RequestsTable reservations={reservations} onUpdate={updateReservation} />
              )}
            </section>
          </>
        )}
      </main>
      {editorOpen && <BookEditor book={editorBook} onClose={() => setEditorOpen(false)} onSaved={saveBook} />}
      {notice && <div role="status" className="fixed bottom-5 right-5 z-40 rounded-xl bg-slate-900 px-5 py-3 text-sm text-white shadow-xl">{notice}</div>}
    </div>
  )
}

function StatCard({ label, value, accent, icon }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      </div>
      <span className={classNames('grid size-12 place-items-center rounded-xl text-xl', accent)}>{icon}</span>
    </div>
  )
}

function BooksTable({ books, onEdit, onDelete }) {
  if (books.length === 0) {
    return <div className="grid min-h-56 place-items-center px-6 text-center text-sm text-slate-500">No books yet. Add the first title to your catalog.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-190 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-6 py-3 font-semibold">Book</th><th className="px-4 py-3 font-semibold">Genre</th><th className="px-4 py-3 font-semibold">Price</th><th className="px-4 py-3 font-semibold">Stock</th><th className="px-4 py-3 font-semibold">Review</th><th className="px-4 py-3 font-semibold">Visibility</th><th className="px-6 py-3 text-right font-semibold">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {books.map((book) => (
            <tr key={book.id} className="hover:bg-slate-50/70">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  {book.cover_image_url ? <img src={book.cover_image_url} alt="" className="size-11 rounded-lg object-cover" /> : <div className="grid size-11 place-items-center rounded-lg bg-emerald-100 font-display text-lg text-emerald-900">{book.title.charAt(0)}</div>}
                  <div><p className="max-w-64 truncate font-semibold text-slate-900">{book.title}</p><p className="mt-0.5 text-xs text-slate-500">{book.author || 'Author not set'}</p></div>
                </div>
              </td>
              <td className="px-4 py-4 text-slate-600">{book.genre || '—'}</td>
              <td className="px-4 py-4 text-slate-700">{money.format(Number(book.price))}</td>
              <td className="px-4 py-4 text-slate-700">{book.stock_quantity}</td>
              <td className="px-4 py-4"><StatusBadge status={book.moderation_status} /></td>
              <td className="px-4 py-4"><StatusBadge status={book.is_listed ? 'listed' : 'hidden'} /></td>
              <td className="px-6 py-4">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(book)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Edit</button>
                  <button onClick={() => onDelete(book)} className="rounded-md px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RequestsTable({ reservations, onUpdate }) {
  if (reservations.length === 0) {
    return <div className="grid min-h-56 place-items-center px-6 text-center text-sm text-slate-500">No book requests have been submitted yet.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-212.5 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-6 py-3 font-semibold">Requested book</th><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Quantity</th><th className="px-4 py-3 font-semibold">Note</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-6 py-3 text-right font-semibold">Review</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reservations.map((reservation) => (
            <tr key={reservation.id} className="align-top hover:bg-slate-50/70">
              <td className="px-6 py-4"><p className="font-semibold text-slate-900">{reservation.books?.title || 'Book removed'}</p><p className="mt-1 text-xs text-slate-500">{new Date(reservation.created_at).toLocaleString()}</p></td>
              <td className="px-4 py-4"><p className="font-medium text-slate-800">{reservation.customer_name}</p><a className="mt-1 block text-xs text-emerald-800 hover:underline" href={`mailto:${reservation.customer_email}`}>{reservation.customer_email}</a>{reservation.customer_phone && <p className="mt-1 text-xs text-slate-500">{reservation.customer_phone}</p>}</td>
              <td className="px-4 py-4 text-slate-700">{reservation.quantity}</td>
              <td className="max-w-52 whitespace-normal px-4 py-4 text-xs leading-5 text-slate-600">{reservation.note || '—'}</td>
              <td className="px-4 py-4"><StatusBadge status={reservation.status} /></td>
              <td className="px-6 py-4">
                {reservation.status === 'pending' ? (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onUpdate(reservation, 'confirmed')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">Confirm</button>
                    <button onClick={() => onUpdate(reservation, 'rejected')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Decline</button>
                  </div>
                ) : <span className="block text-right text-xs text-slate-400">Reviewed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }) {
  const tone = {
    approved: 'bg-emerald-100 text-emerald-800',
    listed: 'bg-emerald-100 text-emerald-800',
    confirmed: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-amber-100 text-amber-800',
    hidden: 'bg-slate-100 text-slate-600',
    rejected: 'bg-red-100 text-red-800',
  }[status] || 'bg-slate-100 text-slate-600'
  return <span className={classNames('inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize', tone)}>{status}</span>
}

function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(() => !isAdminRoute || !supabase)
  const [authOpen, setAuthOpen] = useState(false)
  const isAdmin = user?.app_metadata?.role === 'admin'

  useEffect(() => {
    if (!isAdminRoute || !supabase) {
      return undefined
    }
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) console.error('Could not restore the Supabase session:', error)
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    }).catch((error) => {
      if (!active) return
      console.error('Could not restore the Supabase session:', error)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Could not sign out:', error)
    if (isAdminRoute) window.location.assign('/')
  }

  function navigateTo(path) {
    window.location.assign(path)
  }

  if (!authReady) {
    return <div className="grid min-h-screen place-items-center bg-[#fbfaf6] text-sm text-stone-500">Opening the bookshop…</div>
  }

  if (isAdminRoute) {
    if (!user) {
      return (
        <div className="grid min-h-screen place-items-center bg-[#f5f6f3] p-5">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <Brand />
            <h1 className="mt-8 text-2xl font-semibold text-slate-900">Bookseller sign in</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign in with your staff account to manage the catalog and requests.</p>
            <button onClick={() => setAuthOpen(true)} className="mt-6 w-full rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900">Sign in</button>
            <a href="/" className="mt-5 block text-center text-sm text-emerald-800 hover:underline">Return to customer site</a>
          </section>
          {authOpen && <AdminLoginDialog onClose={() => setAuthOpen(false)} onSignedIn={setUser} />}
        </div>
      )
    }
    return (
      <>
        <AdminDashboard user={user} onSignOut={signOut} onSwitchStorefront={() => navigateTo('/')} />
        {authOpen && <AdminLoginDialog onClose={() => setAuthOpen(false)} onSignedIn={setUser} />}
      </>
    )
  }

  return (
    <>
      <Storefront
        isAdmin={isAdminRoute && isAdmin}
        onSwitchAdmin={() => navigateTo('/admin')}
      />
    </>
  )
}

export default App

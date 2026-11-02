import 'dotenv/config'
import express from 'express'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = Number(process.env.PORT ?? 3200)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
const allowedOrigins = (
  process.env.CORS_ORIGIN ??
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) must be configured.',
  )
}

const bookColumns = [
  'id',
  'title',
  'author',
  'isbn',
  'genre',
  'publisher',
  'published_on',
  'description',
  'cover_image_url',
  'price',
  'stock_quantity',
  'contains_nudity',
  'moderation_status',
  'is_listed',
  'created_at',
  'updated_at',
]
const writableBookColumns = bookColumns.filter(
  (column) => !['id', 'created_at', 'updated_at'].includes(column),
)
const moderationStatuses = new Set(['pending', 'approved', 'rejected'])
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  const origin = req.get('Origin')

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Origin is not allowed.' })
  }

  if (origin) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
  }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  return next()
})

function getSupabaseClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

async function requireUser(req, res, next) {
  const authorization = req.get('Authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!accessToken) {
    return res.status(401).json({ error: 'A valid bearer token is required.' })
  }

  const supabase = getSupabaseClient(accessToken)
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data.user) {
    return res.status(401).json({ error: 'The bearer token is invalid or expired.' })
  }

  req.supabase = supabase
  req.user = data.user
  return next()
}

function requireAdmin(req, res, next) {
  if (req.user?.app_metadata?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access is required.' })
  }

  return next()
}

function validateBookInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'The request body must be a JSON object.')
  }

  const unknownFields = Object.keys(body).filter(
    (field) => !writableBookColumns.includes(field),
  )
  if (unknownFields.length > 0) {
    throw new ApiError(400, `Unsupported book field(s): ${unknownFields.join(', ')}`)
  }

  if (Object.keys(body).length === 0) {
    throw new ApiError(400, 'Provide at least one book field.')
  }

  const book = {}
  for (const field of writableBookColumns) {
    if (Object.hasOwn(body, field)) {
      book[field] = body[field]
    }
  }

  if (!partial && (!Object.hasOwn(book, 'title') || !Object.hasOwn(book, 'price'))) {
    throw new ApiError(400, 'title and price are required when creating a book.')
  }

  if (Object.hasOwn(book, 'title') && (typeof book.title !== 'string' || !book.title.trim())) {
    throw new ApiError(400, 'title must be a non-empty string.')
  }

  for (const field of [
    'author',
    'isbn',
    'genre',
    'publisher',
    'description',
    'cover_image_url',
  ]) {
    if (
      Object.hasOwn(book, field) &&
      book[field] !== null &&
      typeof book[field] !== 'string'
    ) {
      throw new ApiError(400, `${field} must be a string or null.`)
    }
  }

  if (Object.hasOwn(book, 'published_on') && book.published_on !== null) {
    if (
      typeof book.published_on !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(book.published_on)
    ) {
      throw new ApiError(400, 'published_on must be a valid YYYY-MM-DD date or null.')
    }

    const [year, month, day] = book.published_on.split('-').map(Number)
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [
      31,
      isLeapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ]

    if (
      year < 1 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > daysInMonth[month - 1]
    ) {
      throw new ApiError(400, 'published_on must be a valid YYYY-MM-DD date or null.')
    }
  }

  if (
    Object.hasOwn(book, 'price') &&
    (typeof book.price !== 'number' ||
      !Number.isFinite(book.price) ||
      book.price < 0 ||
      book.price > 99_999_999.99)
  ) {
    throw new ApiError(400, 'price must be between 0 and 99999999.99.')
  }

  if (
    Object.hasOwn(book, 'stock_quantity') &&
    (!Number.isInteger(book.stock_quantity) || book.stock_quantity < 0)
  ) {
    throw new ApiError(400, 'stock_quantity must be a non-negative integer.')
  }

  for (const field of ['contains_nudity', 'is_listed']) {
    if (Object.hasOwn(book, field) && typeof book[field] !== 'boolean') {
      throw new ApiError(400, `${field} must be a boolean.`)
    }
  }

  if (
    Object.hasOwn(book, 'moderation_status') &&
    !moderationStatuses.has(book.moderation_status)
  ) {
    throw new ApiError(400, 'moderation_status must be pending, approved, or rejected.')
  }

  return book
}

function sendDatabaseError(res, error) {
  if (error.code === 'PGRST205' || error.code === 'PGRST204') {
    return res.status(503).json({
      error:
        'The Supabase database schema is not up to date. Apply the bookshop migration in the Supabase SQL Editor, then try again.',
    })
  }

  const statusByCode = {
    '22P02': 400,
    '22003': 400,
    '23502': 400,
    '23514': 400,
    '23505': 409,
    '23503': 409,
    '42501': 403,
    '42703': 503,
    PGRST200: 503,
    PGRST116: 404,
  }
  const status = statusByCode[error.code] ?? 500

  if (status === 500) {
    console.error('Books database request failed:', error)
  }

  const errorByStatus = {
    400: 'The book data violates a database constraint.',
    403: 'The database policy does not allow this operation.',
    404: 'Book not found.',
    409: 'A book with one of these unique values already exists.',
    503: 'The Supabase database schema is incomplete. Reapply the bookshop migration in the Supabase SQL Editor, then try again.',
  }
  return res.status(status).json({
    error: status === 500 ? 'The books database request failed.' : errorByStatus[status],
  })
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/catalog', async (req, res) => {
  const { data, error } = await createClient(supabaseUrl, supabaseKey)
    .from('books')
    .select(bookColumns.join(','))
    .eq('moderation_status', 'approved')
    .eq('is_listed', true)
    .eq('contains_nudity', false)
    .order('created_at', { ascending: false })

  if (error) {
    return sendDatabaseError(res, error)
  }

  return res.json(data)
})

app.get('/api/books', requireUser, requireAdmin, async (req, res) => {
  const { data, error } = await req.supabase
    .from('books')
    .select(bookColumns.join(','))
    .order('created_at', { ascending: false })

  if (error) {
    return sendDatabaseError(res, error)
  }

  return res.json(data)
})

app.get('/api/books/:id', requireUser, requireAdmin, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' })
  }

  const { data, error } = await req.supabase
    .from('books')
    .select(bookColumns.join(','))
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) {
    return sendDatabaseError(res, error)
  }
  if (!data) {
    return res.status(404).json({ error: 'Book not found.' })
  }

  return res.json(data)
})

app.post('/api/books', requireUser, requireAdmin, async (req, res) => {
  let book
  try {
    book = validateBookInput(req.body)
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ error: error.message })
    }
    throw error
  }

  const { data, error } = await req.supabase
    .from('books')
    .insert(book)
    .select(bookColumns.join(','))
    .single()

  if (error) {
    return sendDatabaseError(res, error)
  }

  return res.status(201).json(data)
})

app.post('/api/reservations', async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'The request body must be a JSON object.' })
  }

  const {
    book_id: bookId,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    quantity,
    note,
  } = req.body ?? {}

  if (!bookId || !uuidPattern.test(bookId)) {
    return res.status(400).json({ error: 'book_id must be a valid UUID.' })
  }
  if (
    typeof customerName !== 'string' ||
    !customerName.trim() ||
    customerName.trim().length > 120
  ) {
    return res.status(400).json({ error: 'customer_name is required (up to 120 characters).' })
  }
  if (
    typeof customerEmail !== 'string' ||
    customerEmail.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())
  ) {
    return res.status(400).json({ error: 'A valid customer_email is required.' })
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).json({ error: 'quantity must be a whole number between 1 and 99.' })
  }
  if (
    customerPhone !== undefined &&
    customerPhone !== null &&
    (typeof customerPhone !== 'string' || customerPhone.trim().length > 40)
  ) {
    return res.status(400).json({ error: 'customer_phone must be at most 40 characters.' })
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 1000)) {
    return res.status(400).json({ error: 'note must be at most 1000 characters.' })
  }

  const publicSupabase = createClient(supabaseUrl, supabaseKey)
  const { data: book, error: bookError } = await publicSupabase
    .from('books')
    .select('id, stock_quantity')
    .eq('id', bookId)
    .eq('moderation_status', 'approved')
    .eq('is_listed', true)
    .eq('contains_nudity', false)
    .maybeSingle()

  if (bookError) {
    return sendDatabaseError(res, bookError)
  }
  if (!book) {
    return res.status(404).json({ error: 'This book is not available for reservation.' })
  }
  if (book.stock_quantity < quantity) {
    return res.status(409).json({ error: 'There are not enough copies currently available.' })
  }

  const { error } = await publicSupabase
    .from('book_reservations')
    .insert({
      book_id: bookId,
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      customer_phone: customerPhone?.trim() || null,
      quantity,
      note: note?.trim() || null,
    })

  if (error) {
    return sendDatabaseError(res, error)
  }

  return res.status(201).json({ status: 'pending', message: 'Your request was sent to the bookseller.' })
})

app.get('/api/admin/reservations', requireUser, requireAdmin, async (req, res) => {
  const { data, error } = await req.supabase
    .from('book_reservations')
    .select('id, book_id, customer_name, customer_email, customer_phone, quantity, note, status, created_at, updated_at, books(title, author)')
    .order('created_at', { ascending: false })

  if (error) {
    return sendDatabaseError(res, error)
  }

  return res.json(data)
})

app.patch('/api/admin/reservations/:id', requireUser, requireAdmin, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' })
  }
  if (!['confirmed', 'rejected'].includes(req.body?.status)) {
    return res.status(400).json({ error: 'status must be confirmed or rejected.' })
  }

  const { data, error } = await req.supabase
    .from('book_reservations')
    .update({ status: req.body.status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .select('id, status, updated_at')
    .maybeSingle()

  if (error) {
    return sendDatabaseError(res, error)
  }
  if (!data) {
    return res.status(404).json({ error: 'Pending reservation not found.' })
  }

  return res.json(data)
})

app.patch('/api/books/:id', requireUser, requireAdmin, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' })
  }

  let book
  try {
    book = validateBookInput(req.body, { partial: true })
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ error: error.message })
    }
    throw error
  }

  book.updated_at = new Date().toISOString()
  const { data, error } = await req.supabase
    .from('books')
    .update(book)
    .eq('id', req.params.id)
    .select(bookColumns.join(','))
    .maybeSingle()

  if (error) {
    return sendDatabaseError(res, error)
  }
  if (!data) {
    return res.status(404).json({ error: 'Book not found.' })
  }

  return res.json(data)
})

app.delete('/api/books/:id', requireUser, requireAdmin, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' })
  }

  const { data, error } = await req.supabase
    .from('books')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return sendDatabaseError(res, error)
  }
  if (!data) {
    return res.status(404).json({ error: 'Book not found.' })
  }

  return res.sendStatus(204)
})

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' })
  }

  console.error('Unhandled API request error:', error)
  return res.status(500).json({ error: 'An unexpected API error occurred.' })
})

app.listen(port, () => {
  console.log(`Books API is running on http://localhost:${port}`)
})

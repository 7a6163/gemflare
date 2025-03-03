import { Hono } from 'hono'
import { basicAuth, jwtAuth } from './middleware'
import { CloudflareBindings, GemMetadata } from './types'
import {
  getAllGems,
  getGem,
  getGemVersion,
  saveGem,
  incrementDownloads,
  verifyPassword,
  hashPassword,
  extractGemMetadata
} from './utils'
import {
  layout,
  loginPage,
  gemsListPage,
  gemDetailPage,
  uploadPage,
  errorPage
} from './templates'
import { html } from 'hono/html'
import { setCookie, getCookie } from 'hono/cookie'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// API Routes for RubyGems compatibility
const api = new Hono<{ Bindings: CloudflareBindings }>()

// List all gems
api.get('/api/v1/gems', async (c) => {
  const gems = await getAllGems(c.env.GEMFLARE_KV)
  return c.json(gems)
})

// Get specific gem info
api.get('/api/v1/gems/:name', async (c) => {
  const name = c.req.param('name')
  const gem = await getGem(c.env.GEMFLARE_KV, name)

  if (!gem) {
    return c.json({ error: 'Gem not found' }, 404)
  }

  return c.json(gem)
})

// Get specific gem version
api.get('/api/v1/gems/:name/:version', async (c) => {
  const name = c.req.param('name')
  const version = c.req.param('version')
  const gem = await getGemVersion(c.env.GEMFLARE_KV, name, version)

  if (!gem) {
    return c.json({ error: 'Gem version not found' }, 404)
  }

  return c.json(gem)
})

// Upload a gem (requires authentication)
api.post('/api/v1/gems', basicAuth, async (c) => {
  try {
    const formData = await c.req.formData()
    const gemFile = formData.get('gem') as File

    if (!gemFile) {
      return c.json({ error: 'No gem file provided' }, 400)
    }

    const buffer = await gemFile.arrayBuffer()
    const metadata = await extractGemMetadata(buffer)

    // Store gem file in R2
    const key = `${metadata.name}-${metadata.version}.gem`
    await c.env.GEMFLARE_BUCKET.put(key, buffer)

    // Store metadata in KV
    await saveGem(c.env.GEMFLARE_KV, metadata)

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error.message }, 500)
  }
})

// Download a gem
api.get('/gems/:file', async (c) => {
  const filename = c.req.param('file')

  // Extract gem name and version from filename
  const match = filename.match(/^(.+)-([^-]+)\.gem$/)
  if (!match) {
    return c.json({ error: 'Invalid gem filename' }, 400)
  }

  const [_, name, version] = match

  // Get the file from R2
  const object = await c.env.GEMFLARE_BUCKET.get(filename)

  if (!object) {
    return c.json({ error: 'Gem not found' }, 404)
  }

  // Increment download count
  await incrementDownloads(c.env.GEMFLARE_KV, name, version)

  // Return the gem file
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
})

// Web UI Routes
app.get('/', async (c) => {
  const token = getCookie(c, 'auth_token')
  const isLoggedIn = !!token

  return c.html(layout(html`
    <div class="bg-white p-6 rounded-lg shadow-md">
      <h1 class="text-2xl font-bold mb-6">GemFlare - Private RubyGems Server</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-red-50 p-4 rounded-lg border border-red-200">
          <h2 class="text-lg font-semibold mb-2">Using with Bundler</h2>
          <p class="mb-2">Add this to your Gemfile:</p>
          <pre class="bg-gray-100 p-3 rounded">source "https://your-gemflare-url.workers.dev"</pre>
        </div>

        <div class="bg-red-50 p-4 rounded-lg border border-red-200">
          <h2 class="text-lg font-semibold mb-2">Using with RubyGems</h2>
          <p class="mb-2">Configure your gem sources:</p>
          <pre class="bg-gray-100 p-3 rounded">gem sources --add https://your-gemflare-url.workers.dev</pre>
        </div>
      </div>

      <div class="mt-8">
        <a href="/gems" class="bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 mr-4">Browse Gems</a>
        <a href="/upload" class="bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700">Upload Gem</a>
      </div>
    </div>
  `, isLoggedIn))
})

// Login page
app.get('/login', (c) => {
  return c.html(loginPage())
})

// Login form submission
app.post('/login', async (c) => {
  const { username, password } = await c.req.parseBody()

  if (username === c.env.ADMIN_USERNAME) {
    const isValid = await verifyPassword(password as string, c.env.ADMIN_PASSWORD_HASH)

    if (isValid) {
      // In a real implementation, you would use a proper JWT library
      const token = `header.${btoa(JSON.stringify({
        username,
        isAdmin: true,
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
      }))}.signature`

      setCookie(c, 'auth_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'Strict',
        maxAge: 3600
      })

      return c.redirect('/')
    }
  }

  // Generic error message for any login failure
  return c.html(loginPage('Invalid username or password. Please try again.'))
})

// Logout
app.get('/logout', (c) => {
  setCookie(c, 'auth_token', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: 0
  })

  return c.redirect('/login')
})

// List all gems (web UI)
app.get('/gems', async (c) => {
  console.log('Accessing gems list page');
  const token = getCookie(c, 'auth_token');
  console.log('Auth token:', token ? 'present' : 'not present');
  const isLoggedIn = !!token;
  console.log('User is logged in:', isLoggedIn);

  try {
    console.log('Fetching all gems from KV');
    const gems = await getAllGems(c.env.GEMFLARE_KV);
    console.log('Retrieved gems:', gems.length);

    return c.html(gemsListPage(gems, isLoggedIn));
  } catch (error) {
    console.error('Error fetching gems:', error);
    return c.html(errorPage(`Error fetching gems: ${error.message}`, isLoggedIn));
  }
})

// View gem details (web UI)
app.get('/gems/:name', async (c) => {
  const token = getCookie(c, 'auth_token')
  const isLoggedIn = !!token

  const name = c.req.param('name')
  const gem = await getGem(c.env.GEMFLARE_KV, name)

  if (!gem) {
    return c.html(errorPage('Gem not found', isLoggedIn))
  }

  return c.html(gemDetailPage(gem, isLoggedIn))
})

// View specific gem version details (web UI)
app.get('/gems/:name/:version', async (c) => {
  const token = getCookie(c, 'auth_token')
  const isLoggedIn = !!token

  const name = c.req.param('name')
  const version = c.req.param('version')

  console.log(`Accessing specific gem version: ${name} ${version}`)

  const gem = await getGemVersion(c.env.GEMFLARE_KV, name, version)

  if (!gem) {
    return c.html(errorPage(`Gem ${name} version ${version} not found`, isLoggedIn))
  }

  return c.html(gemDetailPage(gem, isLoggedIn))
})

// Upload page (web UI)
app.get('/upload', jwtAuth, (c) => {
  return c.html(uploadPage())
})

// Upload form submission (web UI)
app.post('/upload', jwtAuth, async (c) => {
  try {
    console.log('Starting gem upload process');
    const formData = await c.req.formData();
    console.log('Form data keys:', [...formData.keys()]);

    const gemFile = formData.get('gemFile') as File;
    console.log('Gem file:', gemFile ? { name: gemFile.name, size: gemFile.size, type: gemFile.type } : 'No gem file');

    if (!gemFile) {
      console.error('No gem file provided in the form data');
      return c.html(errorPage('No gem file provided', true));
    }

    console.log('Reading gem file as array buffer');
    const buffer = await gemFile.arrayBuffer();
    console.log('Gem file read, size:', buffer.byteLength);

    console.log('Extracting metadata from gem file');
    const metadata = await extractGemMetadata(buffer, gemFile.name);
    console.log('Extracted metadata:', metadata);

    // Store gem file in R2
    const key = `${metadata.name}-${metadata.version}.gem`;
    console.log('Storing gem file in R2 with key:', key);
    try {
      await c.env.GEMFLARE_BUCKET.put(key, buffer);
      console.log('Gem file stored in R2 successfully');
    } catch (r2Error) {
      console.error('Error storing gem file in R2:', r2Error);
      throw new Error(`Failed to store gem file: ${r2Error.message}`);
    }

    // Store metadata in KV
    console.log('Saving gem metadata to KV');
    try {
      await saveGem(c.env.GEMFLARE_KV, metadata);
      console.log('Gem metadata saved to KV successfully');
    } catch (kvError) {
      console.error('Error saving gem metadata to KV:', kvError);
      throw new Error(`Failed to save gem metadata: ${kvError.message}`);
    }

    console.log('Gem upload completed successfully, redirecting to /gems');
    return c.redirect('/gems');
  } catch (error) {
    console.error('Error in upload process:', error);
    return c.html(errorPage(error.message, true));
  }
})

// Mount API routes
app.route('', api)

export default app

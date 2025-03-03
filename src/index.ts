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
  extractGemMetadata,
  generateSpecsGz,
  generateEmptySpecsGz,
  generateValidSpecsGz,
  generateInfoContent,
  generateNamesContent,
  generateVersionsContent,
  updateSpecsIndexInR2,
  getSpecsIndexFromR2,
  generateDependenciesResponse
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
api.post('/api/v1/gems', async (c) => {
  try {
    // Check authentication
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new Response('Unauthorized', { status: 401 })
    }

    const base64Credentials = authHeader.split(' ')[1]
    const credentials = atob(base64Credentials)
    const [username, password] = credentials.split(':')

    // Verify credentials
    const adminUsername = c.env.ADMIN_USERNAME || 'admin'
    const adminPasswordHash = c.env.ADMIN_PASSWORD_HASH || ''

    if (username !== adminUsername || !await verifyPassword(password, adminPasswordHash)) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Get the gem file from the request
    const formData = await c.req.formData()
    const gemFile = formData.get('file') as File

    if (!gemFile) {
      return new Response('No gem file provided', { status: 400 })
    }

    // Extract metadata from the gem file
    const gemBuffer = await gemFile.arrayBuffer()
    const metadata = await extractGemMetadata(gemBuffer)

    if (!metadata) {
      return new Response('Invalid gem file', { status: 400 })
    }

    // Save the gem to R2
    const objectKey = `gems/${metadata.name}-${metadata.version}.gem`
    console.log('Storing gem file in R2 with key:', objectKey);
    try {
      await c.env.GEMFLARE_BUCKET.put(objectKey, gemBuffer);
      console.log('Gem file stored in R2 successfully');
    } catch (error) {
      console.error('Failed to store gem file:', error);
      return new Response(JSON.stringify({
        success: false,
        message: 'Failed to store gem file: ' + (error instanceof Error ? error.message : String(error))
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // Save metadata to KV
    await saveGem(c.env.GEMFLARE_KV, metadata)
    
    // Update specs index files in R2
    try {
      console.log('Updating specs index files after gem upload');
      const allGems = await getAllGems(c.env.GEMFLARE_KV);
      await updateSpecsIndexInR2(c.env.GEMFLARE_BUCKET, allGems);
      console.log('Specs index files updated successfully');
    } catch (updateError) {
      console.error('Error updating specs index:', updateError);
      // Continue with the response even if updating specs fails
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Gem ${metadata.name} (${metadata.version}) uploaded successfully`
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Error uploading gem:', error)
    return new Response(JSON.stringify({
      success: false,
      message: 'Error uploading gem'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
})

// Download a gem file
api.get('/gems/:file', async (c) => {
  const filename = c.req.param('file')

  if (!filename.endsWith('.gem')) {
    return c.notFound()
  }

  try {
    console.log(`Downloading gem file: ${filename}`)
    const object = await c.env.GEMFLARE_BUCKET.get(`gems/${filename}`)

    if (!object) {
      return c.notFound()
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error(`Error downloading gem: ${error}`)
    return c.json({ error: 'Error downloading gem' }, 500)
  }
})

// Add dependencies endpoint for Bundler compatibility
app.get('/api/v1/dependencies', async (c) => {
  try {
    // Get the gems parameter from the query string
    const gemsParam = c.req.query('gems');
    
    if (!gemsParam) {
      return new Response('No gems specified', { status: 400 });
    }
    
    console.log(`Dependencies requested for: ${gemsParam}`);
    
    // Split the gems parameter by comma
    const requestedGems = gemsParam.split(',').map(gem => gem.trim());
    
    if (requestedGems.length === 0) {
      return new Response('No gems specified', { status: 400 });
    }
    
    // Get all gems from KV
    const allGems = await getAllGems(c.env.GEMFLARE_KV);
    
    // Generate dependencies response
    const dependenciesData = await generateDependenciesResponse(allGems, requestedGems);
    
    // Return the dependencies data as Marshal format
    return new Response(dependenciesData, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
  } catch (error) {
    console.error('Error serving dependencies:', error);
    return new Response('Error generating dependencies', { status: 500 });
  }
});

// Web UI Routes
app.get('/', async (c) => {
  const token = getCookie(c, 'auth_token')
  const isLoggedIn = !!token
  
  // Get the current worker URL
  const currentUrl = new URL(c.req.url).origin

  return c.html(layout(html`
    <div class="bg-white p-6 rounded-lg shadow-md">
      <h1 class="text-2xl font-bold mb-6">GemFlare - Private RubyGems Server</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-red-50 p-4 rounded-lg border border-red-200">
          <h2 class="text-lg font-semibold mb-2">Using with Bundler</h2>
          <p class="mb-2">Add this to your Gemfile:</p>
          <pre class="bg-gray-100 p-3 rounded">source "${currentUrl}"</pre>
        </div>

        <div class="bg-red-50 p-4 rounded-lg border border-red-200">
          <h2 class="text-lg font-semibold mb-2">Using with RubyGems</h2>
          <p class="mb-2">Configure your gem sources:</p>
          <pre class="bg-gray-100 p-3 rounded">gem sources --add ${currentUrl}</pre>
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

  // Get the current worker URL
  const currentUrl = new URL(c.req.url).origin

  try {
    console.log('Fetching all gems from KV');
    const gems = await getAllGems(c.env.GEMFLARE_KV);
    console.log(`Found ${gems.length} gems`);

    return c.html(gemsListPage(gems, isLoggedIn, currentUrl));
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

  // Get the current worker URL
  const currentUrl = new URL(c.req.url).origin

  if (!gem) {
    return c.html(errorPage('Gem not found', isLoggedIn))
  }

  return c.html(gemDetailPage(gem, isLoggedIn, currentUrl))
})

// View specific gem version details (web UI)
app.get('/gems/:name/:version', async (c) => {
  const token = getCookie(c, 'auth_token')
  const isLoggedIn = !!token

  const name = c.req.param('name')
  const version = c.req.param('version')

  console.log(`Accessing specific gem version: ${name} ${version}`)

  const gem = await getGemVersion(c.env.GEMFLARE_KV, name, version)

  // Get the current worker URL
  const currentUrl = new URL(c.req.url).origin

  if (!gem) {
    return c.html(errorPage(`Gem ${name} version ${version} not found`, isLoggedIn))
  }

  return c.html(gemDetailPage(gem, isLoggedIn, currentUrl))
})

// Upload page (web UI)
app.get('/upload', async (c) => {
  const token = getCookie(c, 'auth_token')
  if (!token) {
    return c.redirect('/login')
  }

  // Get the current worker URL
  const currentUrl = new URL(c.req.url).origin

  return c.html(uploadPage(currentUrl))
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

// Add specs.4.8.gz endpoint for RubyGems compatibility
app.get('/specs.4.8.gz', async (c) => {
  try {
    console.log('Serving specs.4.8.gz from R2');
    
    // Get specs file from R2
    const specsGz = await getSpecsIndexFromR2(c.env.GEMFLARE_BUCKET, 'specs.4.8.gz');
    
    return new Response(specsGz, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
  } catch (error) {
    console.error('Error serving specs.4.8.gz:', error);
    return new Response('Error generating specs', { status: 500 });
  }
});

// Add latest_specs.4.8.gz endpoint
app.get('/latest_specs.4.8.gz', async (c) => {
  try {
    console.log('Serving latest_specs.4.8.gz from R2');
    
    // Get specs file from R2
    const specsGz = await getSpecsIndexFromR2(c.env.GEMFLARE_BUCKET, 'latest_specs.4.8.gz');
    
    return new Response(specsGz, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
  } catch (error) {
    console.error('Error serving latest_specs.4.8.gz:', error);
    return new Response('Error generating specs', { status: 500 });
  }
});

// Add prerelease_specs.4.8.gz endpoint
app.get('/prerelease_specs.4.8.gz', async (c) => {
  try {
    console.log('Serving prerelease_specs.4.8.gz from R2');
    
    // Get specs file from R2
    const specsGz = await getSpecsIndexFromR2(c.env.GEMFLARE_BUCKET, 'prerelease_specs.4.8.gz');
    
    return new Response(specsGz, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
  } catch (error) {
    console.error('Error serving prerelease_specs.4.8.gz:', error);
    return new Response('Error generating specs', { status: 500 });
  }
});

// Add Compact Index support
// https://blog.packagecloud.io/evolution-of-rubygem-index-from-marshal48gz-specs48gz-latest_specs48gz-bundler-api-to-compact-index/

// Compact Index - info endpoint (root)
app.get('/info', async (c) => {
  try {
    console.log('Generating info index');
    
    // Return an empty response for the root info endpoint
    return new Response('', {
      headers: {
        'Content-Type': 'text/plain',
        'ETag': `"${Date.now().toString(16)}"`,
        'Cache-Control': 'max-age=60'
      }
    });
  } catch (error) {
    console.error('Error generating info index:', error);
    return new Response('Error', { status: 500 });
  }
});

// Compact Index - info endpoint
app.get('/info/:name', async (c) => {
  try {
    const gemName = c.req.param('name');
    console.log(`Generating info for ${gemName}`);
    
    const content = await generateInfoContent(c.env.GEMFLARE_KV, gemName);
    
    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain',
        'ETag': `"${Date.now().toString(16)}"`,
        'Cache-Control': 'max-age=60'
      }
    });
  } catch (error) {
    console.error('Error generating info:', error);
    return new Response('Not Found', { status: 404 });
  }
});

// Compact Index - names endpoint
app.get('/names', async (c) => {
  try {
    console.log('Generating names list');
    
    const content = await generateNamesContent(c.env.GEMFLARE_KV);
    
    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain',
        'ETag': `"${Date.now().toString(16)}"`,
        'Cache-Control': 'max-age=60'
      }
    });
  } catch (error) {
    console.error('Error generating names:', error);
    return new Response('Error generating names', { status: 500 });
  }
});

// Compact Index - versions endpoint
app.get('/versions', async (c) => {
  try {
    console.log('Generating versions list');
    
    const content = await generateVersionsContent(c.env.GEMFLARE_KV);
    
    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain',
        'ETag': `"${Date.now().toString(16)}"`,
        'Cache-Control': 'max-age=60'
      }
    });
  } catch (error) {
    console.error('Error generating versions:', error);
    return new Response('Error generating versions', { status: 500 });
  }
});

// Compact Index - root endpoint
app.get('/api/v1/dependencies', async (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`${url.protocol}//${url.host}/info`);
});

// Admin routes
const admin = new Hono<{ Bindings: CloudflareBindings }>()

// Admin endpoint to manually update specs index files
admin.get('/update-specs', jwtAuth, async (c) => {
  try {
    console.log('Manually updating specs index files');
    
    // Get all gems
    const allGems = await getAllGems(c.env.GEMFLARE_KV);
    console.log(`Found ${allGems.length} gems to include in specs`);
    
    // Update specs index files
    await updateSpecsIndexInR2(c.env.GEMFLARE_BUCKET, allGems);
    
    return c.json({
      success: true,
      message: 'Specs index files updated successfully',
      gems_count: allGems.length
    });
  } catch (error) {
    console.error('Error updating specs index files:', error);
    return c.json({
      success: false,
      message: 'Error updating specs index files',
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Mount admin routes
app.route('/admin', admin);

// Mount API routes
app.route('', api)

export default app

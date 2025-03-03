import { html } from 'hono/html';
import { GemMetadata } from './types';

export const layout = (content: string, isLoggedIn: boolean = false) => html`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GemFlare - Private RubyGems Server</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 min-h-screen">
  <nav class="bg-red-700 text-white p-4">
    <div class="container mx-auto flex justify-between items-center">
      <a href="/" class="text-2xl font-bold">GemFlare</a>
      <div>
        ${isLoggedIn ? html`
          <a href="/gems" class="mr-4">Gems</a>
          <a href="/upload" class="mr-4">Upload</a>
          <a href="/logout" class="bg-red-800 px-3 py-1 rounded">Logout</a>
        ` : html`
          <a href="/login" class="bg-red-800 px-3 py-1 rounded">Login</a>
        `}
      </div>
    </div>
  </nav>

  <main class="container mx-auto p-4">
    ${content}
  </main>

  <footer class="bg-gray-200 p-4 text-center text-gray-600 mt-8">
    <p>GemFlare - Private RubyGems Server</p>
  </footer>
</body>
</html>
`;

export const loginPage = () => layout(html`
<div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md mt-10">
  <h1 class="text-2xl font-bold mb-6 text-center">Login to GemFlare</h1>

  <form action="/login" method="POST">
    <div class="mb-4">
      <label class="block text-gray-700 mb-2" for="username">Username</label>
      <input class="w-full px-3 py-2 border border-gray-300 rounded" type="text" id="username" name="username" required>
    </div>

    <div class="mb-6">
      <label class="block text-gray-700 mb-2" for="password">Password</label>
      <input class="w-full px-3 py-2 border border-gray-300 rounded" type="password" id="password" name="password" required>
    </div>

    <button class="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700" type="submit">Login</button>
  </form>
</div>
`, false);

export const gemsListPage = (gems: GemMetadata[], isLoggedIn: boolean = false) => layout(html`
<div class="bg-white p-6 rounded-lg shadow-md">
  <h1 class="text-2xl font-bold mb-6">Available Gems</h1>

  <div class="mb-6">
    <p>To use this gem server with Bundler, add this to your Gemfile:</p>
    <pre class="bg-gray-100 p-3 rounded mt-2">source "https://your-gemflare-url.workers.dev"</pre>
  </div>

  <table class="min-w-full bg-white">
    <thead>
      <tr>
        <th class="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
        <th class="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Version</th>
        <th class="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Summary</th>
        <th class="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Downloads</th>
      </tr>
    </thead>
    <tbody>
      ${gems.map(gem => html`
        <tr>
          <td class="py-2 px-4 border-b border-gray-200"><a href="/gems/${gem.name}" class="text-red-600 hover:underline">${gem.name}</a></td>
          <td class="py-2 px-4 border-b border-gray-200"><a href="/gems/${gem.name}/${gem.version}" class="text-red-600 hover:underline">${gem.version}</a></td>
          <td class="py-2 px-4 border-b border-gray-200">${gem.summary}</td>
          <td class="py-2 px-4 border-b border-gray-200">${gem.downloads}</td>
        </tr>
      `)}
    </tbody>
  </table>
</div>
`, isLoggedIn);

export const gemDetailPage = (gem: GemMetadata, isLoggedIn: boolean = false) => layout(html`
<div class="bg-white p-6 rounded-lg shadow-md">
  <h1 class="text-2xl font-bold mb-2">${gem.name} (${gem.version})</h1>
  <p class="text-gray-600 mb-6">${gem.summary}</p>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <h2 class="text-lg font-semibold mb-2">Details</h2>
      <ul class="space-y-2">
        <li><strong>Authors:</strong> ${gem.authors.join(', ')}</li>
        <li><strong>Platform:</strong> ${gem.platform}</li>
        <li><strong>SHA:</strong> <span class="font-mono text-sm">${gem.sha}</span></li>
        <li><strong>Downloads:</strong> ${gem.downloads}</li>
        <li><strong>Created:</strong> ${new Date(gem.createdAt).toLocaleDateString()}</li>
      </ul>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Installation</h2>
      <p>Add this to your Gemfile:</p>
      <pre class="bg-gray-100 p-3 rounded mt-2">gem "${gem.name}", "${gem.version}"</pre>

      <p class="mt-4">Or install directly:</p>
      <pre class="bg-gray-100 p-3 rounded mt-2">gem install ${gem.name} -v ${gem.version}</pre>
    </div>
  </div>

  ${gem.info ? html`
    <div class="mt-6">
      <h2 class="text-lg font-semibold mb-2">Description</h2>
      <p>${gem.info}</p>
    </div>
  ` : ''}

  ${gem.requirements.length > 0 ? html`
    <div class="mt-6">
      <h2 class="text-lg font-semibold mb-2">Dependencies</h2>
      <ul class="list-disc pl-5">
        ${gem.requirements.map(req => html`
          <li>${req}</li>
        `)}
      </ul>
    </div>
  ` : ''}
</div>
`, isLoggedIn);

export const uploadPage = () => layout(html`
<div class="bg-white p-6 rounded-lg shadow-md">
  <h1 class="text-2xl font-bold mb-6">Upload Gem</h1>

  <form action="/upload" method="POST" enctype="multipart/form-data" class="mb-6">
    <div class="mb-4">
      <label class="block text-gray-700 mb-2" for="gemFile">Gem File (.gem)</label>
      <input class="w-full px-3 py-2 border border-gray-300 rounded" type="file" id="gemFile" name="gemFile" accept=".gem" required>
    </div>

    <button class="bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700" type="submit">Upload</button>
  </form>

  <div>
    <h2 class="text-lg font-semibold mb-2">Using with gem command</h2>
    <p class="mb-2">You can also push gems using the gem command:</p>
    <pre class="bg-gray-100 p-3 rounded mt-2">gem push your-gem-0.1.0.gem --host https://your-gemflare-url.workers.dev</pre>
  </div>
</div>
`, true);

export const errorPage = (message: string, isLoggedIn: boolean = false) => layout(html`
<div class="bg-white p-6 rounded-lg shadow-md">
  <h1 class="text-2xl font-bold mb-4 text-red-600">Error</h1>
  <p>${message}</p>
  <a href="/" class="inline-block mt-4 bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700">Back to Home</a>
</div>
`, isLoggedIn);

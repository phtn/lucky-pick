# Compression-Stream Usage

---

## 1. Save app state to localStorage

```ts
const filters = {
  category: 'electronics',
  priceRange: [100, 5000],
  sort: 'price-ascending',
  selectedBrands: ['Apple', 'Samsung']
}

// Save
await localState.set('filters', filters)

// Restore
const saved = await localState.get<typeof filters>('filters')

// The stored value is compressed and Base64URL-encoded.
```

---

## 2. Automatically expire cached data

```ts
await localState.set('dashboard', dashboardData, 30 * 60 * 1000)

// Automatically returns null after expiration
const dashboard = await localState.get('dashboard')

// cache a dashboard response for 30 minutes.
```

---

## 3. Share an entire application state

```ts
const state = {
  page: 'orders',
  filters: {
    status: 'pending',
    year: 2026
  },
  pagination: {
    page: 3,
    limit: 50
  }
}

// Generate and copy the share URL
const url = await copyShareURL(state)

// Restore from the URL
const restored = await readShareURL<typeof state>()

// example URL: https://example.com/orders?state=H4sIA...
```

---

## 4. Store temporary state in sessionStorage

```ts
await sessionState.set('checkout', {
  step: 2,
  shippingMethod: 'express',
  coupon: 'SAVE20'
})

const checkout = await sessionState.get('checkout')

// This data disappears when the browser session's storage is cleared.
```

---

## 5. Create compact values for API payloads

```ts
const payload = {
  user: 123,
  permissions: ['read', 'write'],
  preferences: {
    theme: 'dark',
    language: 'en'
  }
}

const compact = await shorten(payload)

// Send compact string to your API
await fetch('/api/state', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ data: compact })
})

// Restore
const original = await restore<typeof payload>(compact)
```

---

## 6. Download compressed backups

```ts
await downloadCompressed(
  {
    settings,
    preferences,
    filters,
    savedViews
  },
  'app-backup.json.gz'
)
```

---

# Important engineering considerations

> 1. Compression is not encryption. Anyone with a shared URL can decode its contents. Never put passwords, access tokens, or sensitive personal information in compressed URLs.

> 2. URL size matters. Browsers, proxies, and servers impose practical URL-length limits. For large states, use server-side storage with a short identifier.
> 3. Compression isn't always beneficial. Tiny values can become larger after compression and Base64URL encoding.
> 4. localStorage has limited capacity. For larger datasets, IndexedDB is a better choice.
> 5. Decompression limits matter. The example checks decompressed size after decompression; for hostile inputs, use streaming size limits to prevent excessive memory consumption.
> 6. Versioning matters. If your application's state structure changes, consider adding migration functions instead of simply rejecting old versions.
> 7. Compression formats must match. A payload compressed with gzip cannot be decoded using deflate-raw.

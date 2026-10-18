// Public image search through Wikimedia Commons. Only Wikimedia-hosted raster
// thumbnails are returned; attribution and the original file page travel with each result.
const API = 'https://commons.wikimedia.org/w/api.php';
const MAX_QUERY = 180;
const MAX_RESULTS = 5;

function plain(value, max = 180) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function createImageSearch({ fetchImpl = fetch } = {}) {
  return {
    async search(input) {
      const query = plain(input, MAX_QUERY);
      if (!query || query.length < 2) return { images: [] };
      const url = new URL(API);
      url.search = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        generator: 'search',
        gsrsearch: 'filetype:bitmap ' + query,
        gsrnamespace: '6',
        gsrlimit: String(MAX_RESULTS),
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: '900'
      }).toString();
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'NasrinAI/1.0 (image search; https://nasrinai.com)' },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('Image search unavailable');
      const data = await response.json();
      const pages = Object.values(data?.query?.pages || {});
      const images = [];
      for (const page of pages) {
        const info = page?.imageinfo?.[0];
        if (!info) continue;
        let imageUrl, sourceUrl;
        try {
          imageUrl = new URL(info.thumburl || info.url);
          sourceUrl = new URL(info.descriptionurl);
        } catch { continue; }
        if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'upload.wikimedia.org') continue;
        if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'commons.wikimedia.org') continue;
        const metadata = info.extmetadata || {};
        images.push({
          title: plain(String(page.title || '').replace(/^File:/, '').replace(/\.[^.]+$/, ''), 120),
          image_url: imageUrl.href,
          source_url: sourceUrl.href,
          license: plain(metadata.LicenseShortName?.value || 'See source page for license', 80),
          artist: plain(metadata.Artist?.value || '', 100)
        });
        if (images.length >= MAX_RESULTS) break;
      }
      return { images };
    }
  };
}

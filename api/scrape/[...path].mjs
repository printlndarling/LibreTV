// /api/scrape/[...path].mjs - Vercel Serverless Function (zero external dependencies)
// 纯正则实现，无需 cheerio

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getAttr(html, attr) {
  const regex = new RegExp(`${attr}="([^"]+)"`, 'i');
  const match = regex.exec(html);
  return match ? match[1] : '';
}

function extractPlayUrls(html) {
  const urls = [];
  const m3u8Regex = /"url":\s*"([^"]+?\.(?:m3u8|mp4)[^"]*)"/g;
  let m;
  while ((m = m3u8Regex.exec(html)) !== null) urls.push({ name: `线路${urls.length + 1}`, url: m[1] });
  const allM3u8 = /https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*/g;
  while ((m = allM3u8.exec(html)) !== null) { if (!urls.some(u => u.url === m[0])) urls.push({ name: `播放${urls.length + 1}`, url: m[0] }); }
  const fetchRegex = /fetch\s*\(\s*['"](https?:\/\/[^'"]+)['"]/g;
  while ((m = fetchRegex.exec(html)) !== null) { if (!urls.some(u => u.url === m[1])) urls.push({ name: `线路${urls.length + 1}`, url: m[1] }); }
  return urls;
}

function dedupUrls(urls) { const seen = new Set(); return urls.filter(p => { const k = p.url; if (seen.has(k)) return false; seen.add(k); return true; }); }

async function searchYingxiang(query) {
  const url = `https://www.yxxq31.cc/search/-------------.html?wd=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const results = [];
  const adPatterns = [/深夜/, /私享/, /午夜/, /福利/, /直播/, /看片/, /免费/, /大家都在/, /热搜/, /扫码/, /下载/, /广告/];
  const items = html.match(/<div[^>]*class="[^"]*module-card-item module-item[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi) || [];
  for (const item of items) {
    if (results.length >= 20) break;
    const titleMatch = item.match(/<strong>([^<]+)<\/strong>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title || adPatterns.some(p => p.test(title))) continue;
    const cover = getAttr(item, 'data-original') || getAttr(item, 'src');
    const subtitleMatch = item.match(/<div[^>]*class="[^"]*module-item-note[^"]*"[^>]*>([^<]+)<\/div>/);
    const subtitle = subtitleMatch ? subtitleMatch[1].trim() : '';
    const hrefMatch = item.match(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<strong/);
    const detailUrl = hrefMatch ? hrefMatch[1] : '';
    const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.yxxq31.cc${detailUrl}`;
    results.push({ vod_id: fullUrl, vod_name: title, vod_pic: cover.startsWith('http') ? cover : `https:${cover}`, vod_remarks: subtitle || '更新至全集', source_name: '映像星球', source_code: 'yingxiang', vod_url: fullUrl });
  }
  return { code: 1, msg: '数据列表', page: 1, pagecount: 1, limit: '20', total: results.length, list: results };
}

async function searchWeiyun(query) {
  const url = `https://www.weiyuntv.com/vodsearch/-------------.html?wd=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const results = [];
  const seen = new Set();
  const linkRegex = /<a[^>]*class="[^"]*hl-item-thumb[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    if (results.length >= 30) break;
    const link = match[0];
    const title = getAttr(link, 'title');
    const cover = getAttr(link, 'data-original');
    const href = getAttr(link, 'href');
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const fullUrl = href.startsWith('http') ? href : `https://www.weiyuntv.com${href}`;
    results.push({ vod_id: fullUrl, vod_name: title, vod_pic: cover.startsWith('http') ? cover : `https:${cover}`, vod_remarks: '在线观看', source_name: '微云TV', source_code: 'weiyun', vod_url: fullUrl });
  }
  return { code: 1, msg: '数据列表', page: 1, pagecount: 1, limit: '20', total: results.length, list: results };
}

async function detailYingxiang(vodUrl) {
  const url = vodUrl.startsWith('http') ? vodUrl : `https://www.yxxq31.cc${vodUrl}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(/[\s-]*映像星球[\s-]*/, '').trim() : '';
  let playUrls = extractPlayUrls(html);
  const playLinkRegex = /<a[^>]*href="([^"]*\/play\/[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = playLinkRegex.exec(html)) !== null) {
    const href = m[1]; const text = m[2].trim();
    playUrls.push({ name: text, url: href.startsWith('http') ? href : `https://www.yxxq31.cc${href}` });
  }
  playUrls = dedupUrls(playUrls);
  const playLinks = playUrls.filter(p => p.url.includes('/play/'));
  return { code: 1, msg: '详情数据', list: [{ vod_id: 1, vod_name: title, vod_play_from: '映像星球', vod_play_url: (playLinks.length > 0 ? playLinks : playUrls).map(p => `${p.name}$${p.url}`).join('$$$') || '暂无播放地址$' }] };
}

async function detailWeiyun(vodUrl) {
  const url = vodUrl.startsWith('http') ? vodUrl : `https://www.weiyuntv.com${vodUrl}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(/[\s-]*微云TV[\s-]*/, '').trim() : '';
  let playUrls = extractPlayUrls(html);
  playUrls = dedupUrls(playUrls);
  return { code: 1, msg: '详情数据', list: [{ vod_id: 1, vod_name: title, vod_play_from: '微云TV', vod_play_url: playUrls.length > 0 ? playUrls.map(p => `${p.name}$${p.url}`).join('$$$') : '暂无播放地址$' }] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length < 4) { res.status(400).json({ error: 'Invalid path' }); return; }
    const source = pathParts[2]; const action = pathParts[3]; const query = urlObj.searchParams.get('wd') || ''; const detailUrl = urlObj.searchParams.get('url') || '';
    let result;
    if (source === 'yingxiang') result = action === 'search' ? await searchYingxiang(query) : await detailYingxiang(detailUrl);
    else if (source === 'weiyun') result = action === 'search' ? await searchWeiyun(query) : await detailWeiyun(detailUrl);
    else { res.status(400).json({ error: `Unknown source: ${source}` }); return; }
    res.status(200).json(result);
  } catch (error) {
    console.error('Scrape error:', error.message);
    res.status(500).json({ code: -1, msg: error.message, list: [] });
  }
}

// /api/scrape/[...path].mjs - Vercel Serverless Function for scraped sources
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ===== 映像星球搜索 =====
async function searchYingxiang(query) {
  const url = `https://www.yxxq31.cc/search/-------------.html?wd=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const results = [];
  const adPatterns = [/深夜/, /私享/, /午夜/, /福利/, /直播/, /看片/, /免费/, /大家都在/, /热搜/, /扫码/, /下载/, /广告/];

  $('div.module-card-item.module-item').each((i, el) => {
    if (i >= 20) return false;
    const title = $(el).find('div.module-card-item-title a strong').text().trim();
    const cover = $(el).find('div.module-item-cover img').attr('data-original') || '';
    const subtitle = $(el).find('div.module-item-note').text().trim();
    const detailUrl = $(el).find('div.module-card-item-footer a:last-child').attr('href') || '';
    if (!title || adPatterns.some(p => p.test(title))) return;
    const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.yxxq31.cc${detailUrl}`;
    results.push({
      vod_id: fullUrl, vod_name: title,
      vod_pic: cover.startsWith('http') ? cover : `https:${cover}`,
      vod_remarks: subtitle || '更新至全集',
      source_name: '映像星球', source_code: 'yingxiang', vod_url: fullUrl
    });
  });

  return { code: 1, msg: '数据列表', page: 1, pagecount: 1, limit: '20', total: results.length, list: results };
}

// ===== 微云TV搜索 =====
async function searchWeiyun(query) {
  const url = `https://www.weiyuntv.com/vodsearch/-------------.html?wd=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('a.hl-item-thumb').each((i, el) => {
    if (i >= 30) return false;
    const title = $(el).attr('title') || '';
    const cover = $(el).attr('data-original') || '';
    const href = $(el).attr('href') || '';
    if (!title || seen.has(title)) return;
    seen.add(title);
    const fullUrl = href.startsWith('http') ? href : `https://www.weiyuntv.com${href}`;
    results.push({
      vod_id: fullUrl, vod_name: title,
      vod_pic: cover.startsWith('http') ? cover : `https:${cover}`,
      vod_remarks: '在线观看',
      source_name: '微云TV', source_code: 'weiyun', vod_url: fullUrl
    });
  });

  return { code: 1, msg: '数据列表', page: 1, pagecount: 1, limit: '20', total: results.length, list: results };
}

// ===== 映像星球详情 =====
async function detailYingxiang(vodUrl) {
  const url = vodUrl.startsWith('http') ? vodUrl : `https://www.yxxq31.cc${vodUrl}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const playUrls = [];

  // 从script中提取播放地址
  $('script').each((i, el) => {
    const text = $(el).html() || '';
    const m3u8Match = text.match(/"url":\s*"(.+?\.(?:m3u8|mp4)[^"]*)"/);
    if (m3u8Match) playUrls.push({ name: `线路${playUrls.length + 1}`, url: m3u8Match[1] });
  });

  // 从播放列表提取
  $('.module-play-list a, [class*="play-list"] a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href && text && (href.includes('/play/') || /^\d+$/.test(text))) {
      playUrls.push({ name: text, url: href.startsWith('http') ? href : `https://www.yxxq31.cc${href}` });
    }
  });

  // 去重只保留play链接
  const unique = [];
  const seen = new Set();
  for (const p of playUrls) {
    if (!seen.has(p.url) && p.url.includes('/play/')) { seen.add(p.url); unique.push(p); }
  }

  return {
    code: 1, msg: '详情数据', list: [{
      vod_id: 1, vod_name: $('title').text().replace(/[\s-]*映像星球[\s-]*/, '').trim(),
      vod_play_from: '映像星球',
      vod_play_url: unique.length > 0 ? unique.map(p => `${p.name}$${p.url}`).join('$$$') : '暂无播放地址$'
    }]
  };
}

// ===== 微云TV详情 =====
async function detailWeiyun(vodUrl) {
  const url = vodUrl.startsWith('http') ? vodUrl : `https://www.weiyuntv.com${vodUrl}`;
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const playUrls = [];

  $('script').each((i, el) => {
    const text = $(el).html() || '';
    const m3u8Match = text.match(/"url":\s*"(.+?\.(?:m3u8|mp4)[^"]*)"/);
    if (m3u8Match) playUrls.push({ name: `播放${playUrls.length + 1}`, url: m3u8Match[1] });
    const fetchMatch = text.match(/fetch\s*\(\s*['"]([^'"]+)['"]/);
    if (fetchMatch && fetchMatch[1].startsWith('http')) playUrls.push({ name: `线路${playUrls.length + 1}`, url: fetchMatch[1] });
  });

  // m3u8全页搜索
  const m3u8Regex = /https?:\/\/[^"'\s]+?\.m3u8[^"'\s]*/g;
  let m3u8Match;
  while ((m3u8Match = m3u8Regex.exec(html)) !== null) {
    playUrls.push({ name: `播放${playUrls.length + 1}`, url: m3u8Match[0] });
  }

  const unique = [];
  const seen = new Set();
  for (const p of playUrls) {
    if (!seen.has(p.url)) { seen.add(p.url); unique.push(p); }
  }

  return {
    code: 1, msg: '详情数据', list: [{
      vod_id: 1, vod_name: $('title').text().replace(/[\s-]*微云TV[\s-]*/, '').trim(),
      vod_play_from: '微云TV',
      vod_play_url: unique.length > 0 ? unique.map(p => `${p.name}$${p.url}`).join('$$$') : '暂无播放地址$'
    }]
  };
}

// ===== Vercel Handler =====
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    // Parse source and action from the path
    // URL pattern: /api/scrape/yingxiang/search?wd=xxx
    // req.url = /api/scrape/yingxiang/search?wd=xxx
    const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathParts = urlObj.pathname.split('/').filter(Boolean); // ['api', 'scrape', 'yingxiang', 'search']

    if (pathParts.length < 4) {
      res.status(400).json({ error: 'Invalid path. Use /api/scrape/{source}/{action}' });
      return;
    }

    const source = pathParts[2]; // yingxiang or weiyun
    const action = pathParts[3]; // search or detail
    const query = urlObj.searchParams.get('wd') || '';
    const detailUrl = urlObj.searchParams.get('url') || '';

    let result;
    if (source === 'yingxiang') {
      if (action === 'search') {
        result = await searchYingxiang(query);
      } else if (action === 'detail') {
        result = await detailYingxiang(detailUrl);
      } else {
        res.status(400).json({ error: 'Unknown action' });
        return;
      }
    } else if (source === 'weiyun') {
      if (action === 'search') {
        result = await searchWeiyun(query);
      } else if (action === 'detail') {
        result = await detailWeiyun(detailUrl);
      } else {
        res.status(400).json({ error: 'Unknown action' });
        return;
      }
    } else {
      res.status(400).json({ error: `Unknown source: ${source}` });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Scrape error:', error.message);
    res.status(500).json({ code: -1, msg: error.message, list: [] });
  }
}

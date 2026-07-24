/**
 * 网页爬虫源 - 将HTML网站转换为AppleCMS JSON格式
 * 支持: 映像星球(yxxq31), 微云TV(weiyuntv)
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SOURCE_CONFIG = {
  yingxiang: {
    name: '映像星球',
    host: 'https://www.yxxq31.cc',
    searchApi: '/search/-------------.html?wd={kw}',
    searchListSelector: 'div.module-card-item.module-item',
    titleSelector: 'div.module-card-item-title a strong',
    coverSelector: 'div.module-item-cover img',
    coverAttr: 'data-original',
    subtitleSelector: 'div.module-item-note',
    urlSelector: 'div.module-card-item-footer a:last-child',
    detailUrlPrefix: '',
    detailApi: '/index.php/vod/detail/id/{id}.html',
    // Play page
    playUrlSelector: 'script:contains("player_aa")',
    playRegex: /"url":\s*"(.+?)"/,
  },
  weiyun: {
    name: '微云TV',
    host: 'https://www.weiyuntv.com',
    searchApi: '/vodsearch/-------------.html?wd={kw}',
    searchListSelector: 'a.hl-item-thumb',
    titleSelector: '',
    titleAttr: 'title',
    coverSelector: '',
    coverAttr: 'data-original',
    subtitleSelector: '',
    urlAttr: 'href',
    detailUrlPrefix: '',
    // Play page - type 2 source
    playUrlSelector: 'script:contains("player_aa")',
    playRegex: /"url":\s*"(.+?)"/,
  }
};

/**
 * 搜索视频 (映像星球风格)
 */
async function searchYingxiang(query) {
  const cfg = SOURCE_CONFIG.yingxiang;
  const url = `${cfg.host}${cfg.searchApi.replace('{kw}', encodeURIComponent(query))}`;

  const resp = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000
  });

  const html = resp.data;
  const $ = cheerio.load(html);
  const results = [];

  const adPatterns = [/深夜/, /私享/, /午夜/, /福利/, /直播/, /看片/, /免费/, /大家都在/, /热搜/, /扫码/, /下载/, /广告/];

  $(cfg.searchListSelector).each((i, el) => {
    if (i >= 20) return false;

    const title = $(el).find(cfg.titleSelector).text().trim();
    const cover = $(el).find(cfg.coverSelector).attr(cfg.coverAttr) || '';
    const subtitle = $(el).find(cfg.subtitleSelector).text().trim();
    const detailUrl = $(el).find(cfg.urlSelector).attr('href') || '';

    // 过滤广告/推广内容（推广卡片通常不含真实视频链接）
    if (!title || adPatterns.some(p => p.test(title))) return;

    // Use the full detail URL as vod_id so it's passed to detail handler
    const fullUrl = detailUrl.startsWith('http') ? detailUrl : `${cfg.host}${detailUrl}`;

    results.push({
      vod_id: fullUrl,  // 直接使用URL作为ID，传给detail handler
      vod_name: title,
      vod_pic: cover.startsWith('http') ? cover : `https:${cover}`,
      vod_remarks: subtitle || '更新至全集',
      source_name: cfg.name,
      source_code: 'yingxiang',
      vod_url: fullUrl
    });
  });

  return {
    code: 1,
    msg: '数据列表',
    page: 1,
    pagecount: 1,
    limit: '20',
    total: results.length,
    list: results
  };
}

/**
 * 搜索视频 (微云TV风格)
 */
async function searchWeiyun(query) {
  const cfg = SOURCE_CONFIG.weiyun;
  const url = `${cfg.host}${cfg.searchApi.replace('{kw}', encodeURIComponent(query))}`;

  const resp = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000
  });

  const html = resp.data;
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  // 微云TV的搜索结果在hl-item-thumb链接中
  $(cfg.searchListSelector).each((i, el) => {
    if (i >= 30) return false;

    const title = $(el).attr('title') || '';
    const cover = $(el).attr('data-original') || '';
    const href = $(el).attr('href') || '';

    if (!title || seen.has(title)) return;
    seen.add(title);

    const fullUrl = href.startsWith('http') ? href : `${cfg.host}${href}`;

    results.push({
      vod_id: fullUrl,
      vod_name: title,
      vod_pic: cover.startsWith('http') ? cover : `https:${cover}`,
      vod_remarks: '在线观看',
      source_name: cfg.name,
      source_code: 'weiyun',
      vod_url: fullUrl
    });
  });

  return {
    code: 1,
    msg: '数据列表',
    page: 1,
    pagecount: 1,
    limit: '20',
    total: results.length,
    list: results
  };
}

/**
 * 获取视频详情和播放地址 (映像星球)
 */
async function detailYingxiang(vodUrl) {
  const cfg = SOURCE_CONFIG.yingxiang;
  const url = vodUrl.startsWith('http') ? vodUrl : `${cfg.host}${vodUrl}`;

  const resp = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000
  });

  const html = resp.data;
  const $ = cheerio.load(html);

  // Extract play URLs from the page
  const playUrls = [];

  // 方法1: 从player_aa script中提取
  $('script').each((i, el) => {
    const text = $(el).html() || '';
    const match = text.match(/"url":\s*"(.+?)"/);
    if (match) {
      playUrls.push({
        name: '线路一',
        url: match[1]
      });
    }
  });

  // 方法2: 从播放列表提取（只提取真正的播放链接）
  $('.module-play-list a, .play-list a, [class*="play"] a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href && text && (href.includes('/play/') || /^\d+$/.test(text))) {
      playUrls.push({
        name: text,
        url: href.startsWith('http') ? href : `${cfg.host}${href}`
      });
    }
  });

  // 去重
  const uniqueUrls = [];
  const seen = new Set();
  for (const p of playUrls) {
    if (!seen.has(p.url) && p.url.includes('/play/')) {
      seen.add(p.url);
      uniqueUrls.push(p);
    }
  }

  // 如果没找到好的播放链接，获取整个播放列表
  if (uniqueUrls.length === 0) {
    // 从播放器配置中提取
    $('script').each((i, el) => {
      const text = $(el).html() || '';
      // 尝试匹配 player_aaaa 配置
      const matches = text.match(/"url":\s*"(.+?\.(m3u8|mp4))"/);
      if (matches) {
        uniqueUrls.push({ name: '播放地址', url: matches[1] });
      }
    });
  }

  return {
    code: 1,
    msg: '详情数据',
    list: [{
      vod_id: 1,
      vod_name: $('title').text().replace(/[\s-]*映像星球[\s-]*/, '').trim(),
      vod_play_from: '映像星球',
      vod_play_url: uniqueUrls.length > 0
        ? uniqueUrls.map(p => `${p.name}$${p.url}`).join('$$$')
        : '暂无播放地址$'
    }]
  };
}

/**
 * 获取视频详情和播放地址 (微云TV)
 */
async function detailWeiyun(vodUrl) {
  const url = vodUrl.startsWith('http') ? vodUrl : `https://www.weiyuntv.com${vodUrl}`;

  const resp = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000
  });

  const html = resp.data;
  const $ = cheerio.load(html);

  const playUrls = [];

  // 微云TV: 从script标签提取 player_aa/urls 的 URL
  $('script').each((i, el) => {
    const text = $(el).html() || '';

    // 提取 player_aaaa 配置中的URL
    const urlMatch = text.match(/"url":\s*"(.+?\.(?:m3u8|mp4)[^"]*)"/);
    if (urlMatch) {
      playUrls.push({ name: `线路${playUrls.length + 1}`, url: urlMatch[1] });
    }

    // 提取 fetch URL
    const fetchMatch = text.match(/fetch\s*\(\s*['"]([^'"]+)['"]/);
    if (fetchMatch && fetchMatch[1].startsWith('http')) {
      playUrls.push({ name: `线路${playUrls.length + 1}`, url: fetchMatch[1] });
    }
  });

  // 尝试从播放列表链接提取
  $('.hl-plays-list a, [class*="playlist"] a, .stui-content__playlist a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href && text && /[集\d]/.test(text)) {
      const fullUrl = href.startsWith('http') ? href : `https://www.weiyuntv.com${href}`;
      playUrls.push({ name: text, url: fullUrl });
    }
  });

  // 提取页面中所有m3u8链接
  const htmlForMatch = resp.data;
  const m3u8Regex = /https?:\/\/[^"'\s]+?\.m3u8[^"'\s]*/g;
  let m3u8Match;
  while ((m3u8Match = m3u8Regex.exec(htmlForMatch)) !== null) {
    playUrls.push({ name: `播放${playUrls.length + 1}`, url: m3u8Match[0] });
  }

  // 去重
  const uniqueUrls = [];
  const seen = new Set();
  for (const p of playUrls) {
    if (!seen.has(p.url)) {
      seen.add(p.url);
      uniqueUrls.push(p);
    }
  }

  return {
    code: 1,
    msg: '详情数据',
    list: [{
      vod_id: 1,
      vod_name: $('title').text().replace(/[\s-]*微云TV[\s-]*/, '').trim(),
      vod_play_from: '微云TV$$$播放地址',
      vod_play_url: uniqueUrls.map(p => `${p.name}$${p.url}`).join('$$$')
    }]
  };
}

export { searchYingxiang, searchWeiyun, detailYingxiang, detailWeiyun };

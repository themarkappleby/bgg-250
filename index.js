#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const START_URL = "https://boardgamegeek.com/browse/boardgame";

function parseArgs(argv) {
  const args = { allPages: false, out: "boardgames.json", delayMs: 500, limit: 250 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all-pages" || arg === "-a") {
      args.allPages = true;
    } else if ((arg === "--out" || arg === "-o") && i + 1 < argv.length) {
      args.out = argv[i + 1];
      i += 1;
    } else if ((arg === "--delay" || arg === "-d") && i + 1 < argv.length) {
      args.delayMs = Number(argv[i + 1]);
      i += 1;
    } else if ((arg === "--limit" || arg === "-l") && i + 1 < argv.length) {
      args.limit = Math.max(1, Number(argv[i + 1]));
      i += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
  return response.data;
}

function normalizeNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[\,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "–" || cleaned === "-") return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function roundTo(value, decimals) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function extractGamesFromHtml(html) {
  const $ = cheerio.load(html);
  const games = [];
  $("table#collectionitems tr").each((_, row) => {
    const $row = $(row);
    const tds = $row.find("td");
    if (tds.length < 6) return; // skip headers/invalid rows

    // Rank (1st column)
    const rankCell = $row.find("td:nth-child(1)").first();
    const rankText = rankCell.text().trim();
    const rank = normalizeNumber(rankCell.attr("data-sort") || rankText);
    if (rank === null) return;

    // Image (2nd column)
    const imgEl = $row.find("td:nth-child(2) img").first();
    let imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || "";
    if (imgSrc && imgSrc.startsWith("//")) imgSrc = `https:${imgSrc}`;
    const image = imgSrc ? `@${imgSrc}` : null;

    // Title + Year (3rd column)
    const titleCell = $row.find("td:nth-child(3)").first();
    const titleAnchor = titleCell.find("a").first();
    const rawTitle = titleAnchor.text().trim();
    // The cell often contains "Title (YYYY)"; prefer explicit parse
    const cellText = titleCell.text();
    const yearMatch = cellText.match(/\((\d{4})\)/);
    const year = yearMatch ? normalizeNumber(yearMatch[1]) : null;
    const title = rawTitle;
  let relativeHref = titleAnchor.attr("href") || "";
  if (relativeHref && !relativeHref.startsWith("http")) {
    relativeHref = new URL(relativeHref, "https://boardgamegeek.com").toString();
  }

    // Ratings and voters (4th, 5th, 6th columns) using data-sort for precision
    const grCell = $row.find("td:nth-child(4)").first();
    const arCell = $row.find("td:nth-child(5)").first();
    const nvCell = $row.find("td:nth-child(6)").first();

    const geekRatingRaw = normalizeNumber(grCell.attr("data-sort") || grCell.text());
    const avgRatingRaw = normalizeNumber(arCell.attr("data-sort") || arCell.text());
    const numVotersRaw = normalizeNumber(nvCell.attr("data-sort") || nvCell.text());

    const geekRating = geekRatingRaw == null ? null : roundTo(geekRatingRaw, 3);
    const avgRating = avgRatingRaw == null ? null : roundTo(avgRatingRaw, 2);
    const numVoters = numVotersRaw == null ? null : Math.round(numVotersRaw);

    games.push({
      rank,
      title,
      year,
      image,
      url: relativeHref || null,
      geek_rating: geekRating,
      avg_rating: avgRating,
      num_voters: numVoters,
    });
  });
  return games;
}

function getNextPageUrl(html) {
  const $ = cheerio.load(html);
  // The pager shows numbered links with a "Next »" link
  const nextLink = $("a:contains('Next »')").first();
  if (nextLink && nextLink.attr("href")) {
    const relative = nextLink.attr("href");
    if (relative.startsWith("http")) return relative;
    return new URL(relative, START_URL).toString();
  }
  return null;
}

function coerceInt(value) {
  if (value === undefined || value === null) return null;
  const n = Number(String(value).replace(/[\,\s]/g, ""));
  return Number.isNaN(n) ? null : Math.trunc(n);
}

function coerceFloat(value, decimals = null) {
  if (value === undefined || value === null) return null;
  const n = Number(String(value).replace(/[\,\s]/g, ""));
  if (Number.isNaN(n)) return null;
  return decimals == null ? n : roundTo(n, decimals);
}

function parseBestPlayersFromText(text) {
  if (!text) return { min: null, max: null };
  const bestMatch = text.match(/Best:\s*([\d,\s\-–]+)/i);
  if (!bestMatch) return { min: null, max: null };
  const nums = Array.from(bestMatch[1].matchAll(/\d+/g)).map((m) => Number(m[0]));
  if (!nums.length) return { min: null, max: null };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function extractDetailsFromGameHtml(html) {
  const $ = cheerio.load(html);

  // Primary: parse embedded GEEK.geekitemPreload JSON
  try {
    const match = html.match(/GEEK\.geekitemPreload\s*=\s*(\{[\s\S]*?\});/);
    if (match && match[1]) {
      const preload = JSON.parse(match[1]);
      const item = preload?.item || {};

      const minPlayers = coerceInt(item.minplayers);
      const maxPlayers = coerceInt(item.maxplayers);
      const minPlay = coerceInt(item.minplaytime);
      const maxPlay = coerceInt(item.maxplaytime);

      // Weight from polls or stats
      const weightFromPoll = item?.polls?.boardgameweight?.averageweight;
      const weightFromStats = item?.stats?.avgweight;
      const weight = coerceFloat(weightFromPoll ?? weightFromStats, 2);

      // Best players from polls.userplayers.best[] ranges
      let minBest = null;
      let maxBest = null;
      const bestRanges = item?.polls?.userplayers?.best;
      if (Array.isArray(bestRanges) && bestRanges.length) {
        const mins = bestRanges.map((r) => coerceInt(r?.min)).filter((n) => n != null);
        const maxs = bestRanges.map((r) => coerceInt(r?.max)).filter((n) => n != null);
        if (mins.length && maxs.length) {
          minBest = Math.min(...mins);
          maxBest = Math.max(...maxs);
        }
      }

      return {
        min_players: minPlayers ?? null,
        max_players: maxPlayers ?? null,
        min_best_players: minBest,
        max_best_players: maxBest,
        min_playing_time: minPlay ?? null,
        max_playing_time: maxPlay ?? null,
        weight: weight ?? null,
      };
    }
  } catch (_e) {
    // continue to other strategies
  }

  // Secondary: try Next.js JSON if present on some pages
  try {
    const nextDataText = $("script#__NEXT_DATA__").first().text();
    if (nextDataText) {
      const nextData = JSON.parse(nextDataText);
      const pageProps = nextData?.props?.pageProps || {};
      const game = pageProps.game || pageProps.data?.game || pageProps.boardgame || pageProps;

      const minPlayers = coerceInt(game?.minplayers ?? game?.minPlayers ?? pageProps?.minplayers ?? pageProps?.minPlayers);
      const maxPlayers = coerceInt(game?.maxplayers ?? game?.maxPlayers ?? pageProps?.maxplayers ?? pageProps?.maxPlayers);
      const minPlay = coerceInt(game?.minplaytime ?? game?.minPlaytime ?? pageProps?.minplaytime ?? pageProps?.minPlaytime);
      const maxPlay = coerceInt(game?.maxplaytime ?? game?.maxPlaytime ?? pageProps?.maxplaytime ?? pageProps?.maxPlaytime);
      const weightRaw = game?.statistics?.ratings?.averageweight ?? game?.averageweight ?? game?.averageWeight ?? pageProps?.statistics?.ratings?.averageweight ?? pageProps?.averageweight ?? pageProps?.averageWeight;
      const weight = coerceFloat(weightRaw, 2);

      let minBest = null;
      let maxBest = null;
      const polls = game?.polls || pageProps?.polls || [];
      const bestPoll = Array.isArray(polls) ? polls.find((p) => /suggested_numplayers/i.test(p?.name || "")) : null;
      if (bestPoll && Array.isArray(bestPoll.results)) {
        const bestNumbers = [];
        for (const r of bestPoll.results) {
          const numPlayersToken = r?.numplayers || r?.numPlayers || "";
          const num = coerceInt(String(numPlayersToken).match(/\d+/)?.[0]);
          if (!num) continue;
          const bestEntry = Array.isArray(r?.result) ? r.result.find((rr) => /best/i.test(rr?.value || "")) : null;
          const recEntry = Array.isArray(r?.result) ? r.result.find((rr) => /recommended/i.test(rr?.value || "")) : null;
          const notRecEntry = Array.isArray(r?.result) ? r.result.find((rr) => /not\s*recommended/i.test(rr?.value || "")) : null;
          const bestVotes = coerceInt(bestEntry?.numvotes) || 0;
          const recVotes = coerceInt(recEntry?.numvotes) || 0;
          const notRecVotes = coerceInt(notRecEntry?.numvotes) || 0;
          const maxVotes = Math.max(bestVotes, recVotes, notRecVotes);
          if (maxVotes > 0 && bestVotes === maxVotes) bestNumbers.push(num);
        }
        if (bestNumbers.length) {
          minBest = Math.min(...bestNumbers);
          maxBest = Math.max(...bestNumbers);
        }
      }

      return {
        min_players: minPlayers ?? null,
        max_players: maxPlayers ?? null,
        min_best_players: minBest,
        max_best_players: maxBest,
        min_playing_time: minPlay ?? null,
        max_playing_time: maxPlay ?? null,
        weight: weight ?? null,
      };
    }
  } catch (_e2) {
    // continue to DOM fallback
  }

  // Fallback: parse visible text heuristically
  const headerText = $("body").text();
  const playersRange = headerText.match(/Players[^\d]*(\d+)\s*[\-–]\s*(\d+)/i);
  const minPlayers = playersRange ? coerceInt(playersRange[1]) : null;
  const maxPlayers = playersRange ? coerceInt(playersRange[2]) : null;
  const bestPlayers = parseBestPlayersFromText(headerText);
  const timeRange = headerText.match(/Playing\s*time[^\d]*(\d+)\s*[\-–]\s*(\d+)/i);
  const minPlay = timeRange ? coerceInt(timeRange[1]) : null;
  const maxPlay = timeRange ? coerceInt(timeRange[2]) : null;
  let weight = null;
  const weightMatch = headerText.match(/Weight[^\d]*([\d.]+)\s*\/\s*5/i) || headerText.match(/Complexity[^\d]*([\d.]+)/i);
  if (weightMatch) weight = coerceFloat(weightMatch[1], 2);

  return {
    min_players: minPlayers,
    max_players: maxPlayers,
    min_best_players: bestPlayers.min,
    max_best_players: bestPlayers.max,
    min_playing_time: minPlay,
    max_playing_time: maxPlay,
    weight,
  };
}

async function fetchGameDetails(gameUrl, attempts = 3) {
  if (!gameUrl) return {
    min_players: null,
    max_players: null,
    min_best_players: null,
    max_best_players: null,
    min_playing_time: null,
    max_playing_time: null,
    weight: null,
  };
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const html = await fetchHtml(gameUrl);
      return extractDetailsFromGameHtml(html);
    } catch (e) {
      lastError = e;
      const backoff = Math.min(2000, 250 * attempt);
      await sleep(backoff);
    }
  }
  throw lastError || new Error("Failed to fetch game details");
}

async function scrapeAll({ allPages, delayMs, limit }) {
  let url = START_URL;
  const results = [];
  let page = 1;
  const targetCount = allPages ? Number.POSITIVE_INFINITY : Math.max(1, Number(limit) || 250);

  while (url) {
    try {
      const html = await fetchHtml(url);
      const pageGames = extractGamesFromHtml(html);
      // Avoid duplicates by rank if present
      const existingRanks = new Set(results.map((g) => g.rank));
      pageGames.forEach((g) => {
        if (!existingRanks.has(g.rank)) results.push(g);
      });
      process.stdout.write(`Scraped page ${page} → +${pageGames.length} (total ${results.length})\n`);

      if (!allPages && results.length >= targetCount) break;

      const nextUrl = getNextPageUrl(html);
      if (!nextUrl) break;
      url = nextUrl;
      page += 1;
      if (delayMs > 0) await sleep(delayMs);
    } catch (error) {
      process.stderr.write(`Error scraping ${url}: ${error.message}\n`);
      break;
    }
  }
  // Select only the desired number of games
  const selected = allPages ? results : results.slice(0, targetCount);

  // Enrich each selected game with details from its page
  for (let i = 0; i < selected.length; i += 1) {
    const game = selected[i];
    try {
      const details = await fetchGameDetails(game.url);
      Object.assign(game, details);
      process.stdout.write(`Enriched #${game.rank} ${game.title} with details (${i + 1}/${selected.length})\n`);
      if (delayMs > 0) await sleep(delayMs);
    } catch (e) {
      process.stderr.write(`Error fetching details for ${game.title}: ${e.message}\n`);
    }
  }

  return selected;
}

function writeJsonFile(filePath, data) {
  const outPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
  return outPath;
}

(async function main() {
  const args = parseArgs(process.argv);
  const names = await scrapeAll({ allPages: args.allPages, delayMs: args.delayMs, limit: args.limit });
  const outPath = writeJsonFile(args.out, names);
  process.stdout.write(`Wrote ${names.length} games → ${outPath}\n`);
  process.stdout.write(`Open index.html in a local server to view the table (e.g. npx http-server).\n`);
})();



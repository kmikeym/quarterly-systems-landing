var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-SHym54/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// status-api.js
var status_api_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowedOrigins = [
      "https://quarterly.systems",
      "https://www.quarterly.systems",
      "https://quarterly-systems-landing.pages.dev",
      "http://localhost:4321",
      // Astro dev server
      "http://localhost:3000"
      // Alternative dev server
    ];
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "https://quarterly.systems",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (url.pathname === "/api/status") {
        const statusData = await getStatusData(env);
        return new Response(JSON.stringify(statusData), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      if (url.pathname === "/api/refresh") {
        await refreshData(env);
        return new Response(JSON.stringify({ status: "refreshed" }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      if (url.pathname === "/api/location" && request.method === "POST") {
        const locationData = await request.json();
        await updateLocation(env, locationData);
        return new Response(JSON.stringify({ status: "location updated" }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      if (url.pathname === "/api/activities") {
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const activitiesData = await getActivitiesHistory(env, page, limit);
        return new Response(JSON.stringify(activitiesData), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshData(env));
  }
};
async function getStatusData(env) {
  const cached = await env.STATUS_KV.get("status_data");
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.lastUpdate < 6e5) {
      return data;
    }
  }
  return await refreshData(env);
}
__name(getStatusData, "getStatusData");
async function refreshData(env) {
  const now = Date.now();
  console.log("Refreshing status data...");
  const currentLocationData = await env.STATUS_KV.get("current_location");
  const currentLocation = currentLocationData ? JSON.parse(currentLocationData) : { name: "Los Angeles, CA", coordinates: [34.0522, -118.2437], timestamp: (/* @__PURE__ */ new Date()).toISOString() };
  const [githubData, rssData] = await Promise.allSettled([
    fetchGitHubRSS(),
    fetchRSSFeeds()
  ]);
  const existingActivities = await env.STATUS_KV.get("all_activities");
  let allActivities = existingActivities ? JSON.parse(existingActivities) : [];
  const newActivities = [];
  if (githubData.status === "fulfilled" && githubData.value) {
    githubData.value.forEach((activity) => {
      if (!allActivities.some((existing) => existing.id === activity.id)) {
        newActivities.push({
          ...activity,
          location: currentLocation.name,
          coordinates: currentLocation.coordinates,
          locationTimestamp: currentLocation.timestamp
        });
      }
    });
  }
  if (rssData.status === "fulfilled" && rssData.value) {
    rssData.value.forEach((activity) => {
      if (!allActivities.some((existing) => existing.id === activity.id)) {
        newActivities.push({
          ...activity,
          location: currentLocation.name,
          coordinates: currentLocation.coordinates,
          locationTimestamp: currentLocation.timestamp
        });
      }
    });
  }
  allActivities.unshift(...newActivities);
  allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const statusData = {
    lastUpdate: now,
    location: {
      name: currentLocation.name,
      coordinates: currentLocation.coordinates,
      lastSeen: currentLocation.timestamp
    },
    activities: allActivities.slice(0, 20),
    // Latest 20 for main feed
    services: {
      vibecode: { status: "operational", uptime: "99.9%", responseTime: "142ms" },
      office: { status: "operational", uptime: "99.8%", responseTime: "89ms" },
      main: { status: "operational", uptime: "99.9%", responseTime: "76ms" }
    }
  };
  await env.STATUS_KV.put("status_data", JSON.stringify(statusData), {
    expirationTtl: 1800
    // 30 minutes
  });
  await env.STATUS_KV.put("all_activities", JSON.stringify(allActivities));
  console.log("Status data refreshed:", newActivities.length, "new activities added");
  return statusData;
}
__name(refreshData, "refreshData");
async function fetchGitHubRSS() {
  try {
    const activities = [];
    const gitHubFeeds = [
      {
        url: "https://github.com/kmikeym/quarterly-systems-landing/commits/main.atom",
        repository: "kmikeym/quarterly-systems-landing"
      },
      {
        url: "https://github.com/kmikeym/quarterlykb/commits/v4.atom",
        repository: "kmikeym/quarterlykb"
      },
      {
        url: "https://github.com/kmikeym.atom",
        repository: "all-repositories"
      }
    ];
    for (const feed of gitHubFeeds) {
      try {
        const response = await fetch(feed.url, {
          headers: {
            "User-Agent": "Quarterly-Systems-Status/1.0"
          }
        });
        if (!response.ok) {
          console.log(`GitHub RSS feed error for ${feed.repository}: ${response.status}`);
          continue;
        }
        const xml = await response.text();
        const commits = parseGitHubRSSItems(xml, feed.repository);
        activities.push(...commits.slice(0, 3));
      } catch (error) {
        console.error(`Error fetching GitHub RSS for ${feed.repository}:`, error);
      }
    }
    const uniqueActivities = activities.filter(
      (activity, index, self) => index === self.findIndex((a) => a.id === activity.id)
    );
    uniqueActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return uniqueActivities.slice(0, 10);
  } catch (error) {
    console.error("GitHub RSS processing error:", error);
    return [];
  }
}
__name(fetchGitHubRSS, "fetchGitHubRSS");
async function fetchRSSFeeds() {
  const feeds = [
    {
      url: "https://news.kmikeym.com/feed/",
      source: "KmikeyM News",
      type: "content"
    },
    {
      url: "https://kmikeym.substack.com/feed",
      source: "Substack",
      type: "content"
    },
    {
      url: "https://letterboxd.com/kmikeym/rss/",
      source: "Letterboxd",
      type: "R&D"
    },
    {
      url: "https://bsky.app/profile/did:plc:gagojcjzqigtnzz25jmgmhgq/rss",
      source: "Bluesky",
      type: "content"
    }
  ];
  const activities = [];
  for (const feed of feeds) {
    try {
      const response = await fetch(feed.url);
      if (!response.ok) continue;
      const xml = await response.text();
      const items = parseRSSItems(xml);
      for (const item of items.slice(0, 3)) {
        const activityType = feed.type === "R&D" ? "research" : "content";
        const activityTitle = feed.type === "R&D" ? "Research Activity" : "Content Publication";
        const description = feed.type === "R&D" ? `Watched: ${item.title}` : `Published: ${item.title}`;
        activities.push({
          id: `rss-${btoa(item.link).slice(0, 10)}`,
          type: activityType,
          title: activityTitle,
          description,
          timestamp: item.pubDate,
          source: feed.source,
          metadata: {
            title: item.title,
            link: item.link
          }
        });
      }
    } catch (error) {
      console.error(`RSS feed error for ${feed.source}:`, error);
    }
  }
  return activities;
}
__name(fetchRSSFeeds, "fetchRSSFeeds");
function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXML = match[1];
    const title = extractXMLValue(itemXML, "title");
    const description = extractXMLValue(itemXML, "description");
    const link = extractXMLValue(itemXML, "link");
    const pubDate = extractXMLValue(itemXML, "pubDate");
    const itemTitle = title || description || "Post";
    if (itemTitle && link && pubDate) {
      items.push({
        title: itemTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1"),
        link,
        pubDate: new Date(pubDate).toISOString()
      });
    }
  }
  return items.slice(0, 5);
}
__name(parseRSSItems, "parseRSSItems");
function extractXMLValue(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}
__name(extractXMLValue, "extractXMLValue");
function parseGitHubRSSItems(xml, repositoryName) {
  const activities = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXML = match[1];
    const title = extractXMLValue(entryXML, "title");
    const updated = extractXMLValue(entryXML, "updated") || extractXMLValue(entryXML, "published");
    const id = extractXMLValue(entryXML, "id");
    const author = extractXMLValue(entryXML, "name");
    let link = extractXMLValue(entryXML, "link");
    if (!link) {
      const linkMatch = entryXML.match(/<link[^>]+href="([^"]+)"/);
      link = linkMatch ? linkMatch[1] : "";
    }
    if (title && updated && id) {
      let commitHash = "unknown";
      if (id.includes("Commit/")) {
        commitHash = id.split("Commit/")[1] || "unknown";
      } else if (id.includes("push/")) {
        commitHash = id.split("push/")[1] || "unknown";
      }
      const cleanTitle = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
      activities.push({
        id: `github-${commitHash}`,
        type: "development",
        title: "Development Activity",
        description: repositoryName === "all-repositories" ? `${cleanTitle}` : `Pushed commit to ${repositoryName.split("/")[1] || repositoryName}`,
        timestamp: new Date(updated).toISOString(),
        source: "GitHub",
        metadata: {
          repository: repositoryName,
          commitHash: commitHash.substring(0, 8),
          // Short hash
          commitMessage: cleanTitle,
          link,
          author
        }
      });
    }
  }
  return activities;
}
__name(parseGitHubRSSItems, "parseGitHubRSSItems");
async function updateLocation(env, locationData) {
  const { location, activity, coordinates, timestamp } = locationData;
  const cityState = location.trim();
  const locationTimestamp = timestamp || (/* @__PURE__ */ new Date()).toISOString();
  const currentLocation = {
    name: cityState,
    coordinates: coordinates || [34.0522, -118.2437],
    // Default to LA if no coords
    timestamp: locationTimestamp
  };
  await env.STATUS_KV.put("current_location", JSON.stringify(currentLocation));
  const locationActivity = {
    id: `location-${Date.now()}`,
    type: "location",
    title: activity ? "Activity Update" : "Location Update",
    description: activity ? `${activity} in ${cityState}` : `Arrived in ${cityState}`,
    timestamp: locationTimestamp,
    source: "Manual",
    location: cityState,
    coordinates: coordinates || [34.0522, -118.2437],
    locationTimestamp,
    metadata: {
      location: cityState,
      activity,
      coordinates
    }
  };
  const allActivities = await env.STATUS_KV.get("all_activities");
  let fullHistory = allActivities ? JSON.parse(allActivities) : [];
  fullHistory.unshift(locationActivity);
  fullHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const statusData = {
    lastUpdate: Date.now(),
    location: {
      name: currentLocation.name,
      coordinates: currentLocation.coordinates,
      lastSeen: currentLocation.timestamp
    },
    activities: fullHistory.slice(0, 20),
    // Latest 20 for main feed
    services: {
      vibecode: { status: "operational", uptime: "99.9%", responseTime: "142ms" },
      office: { status: "operational", uptime: "99.8%", responseTime: "89ms" },
      main: { status: "operational", uptime: "99.9%", responseTime: "76ms" }
    }
  };
  await env.STATUS_KV.put("status_data", JSON.stringify(statusData));
  await env.STATUS_KV.put("all_activities", JSON.stringify(fullHistory));
  console.log("Location updated:", cityState, "at", locationTimestamp);
}
__name(updateLocation, "updateLocation");
async function getActivitiesHistory(env, page = 1, limit = 50) {
  const allActivities = await env.STATUS_KV.get("all_activities");
  const activities = allActivities ? JSON.parse(allActivities) : [];
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedActivities = activities.slice(startIndex, endIndex);
  return {
    activities: paginatedActivities,
    pagination: {
      page,
      limit,
      total: activities.length,
      totalPages: Math.ceil(activities.length / limit),
      hasNext: endIndex < activities.length,
      hasPrev: page > 1
    }
  };
}
__name(getActivitiesHistory, "getActivitiesHistory");

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-SHym54/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = status_api_default;

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-SHym54/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=status-api.js.map

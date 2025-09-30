// Quarterly Systems Status API Worker
// Aggregates real-time data from GitHub, RSS feeds, and other sources

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Enable CORS for quarterly.systems and common variations
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://quarterly.systems',
      'https://www.quarterly.systems',
      'https://quarterly-systems-landing.pages.dev',
      'http://localhost:4321', // Astro dev server
      'http://localhost:3000'  // Alternative dev server
    ];

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://quarterly.systems',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname === '/api/status') {
        const statusData = await getStatusData(env);
        return new Response(JSON.stringify(statusData), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      if (url.pathname === '/api/refresh') {
        await refreshData(env);
        return new Response(JSON.stringify({ status: 'refreshed' }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      if (url.pathname === '/api/location' && request.method === 'POST') {
        const locationData = await request.json();
        await updateLocation(env, locationData);
        return new Response(JSON.stringify({ status: 'location updated' }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      if (url.pathname === '/api/activities') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const activitiesData = await getActivitiesHistory(env, page, limit);
        return new Response(JSON.stringify(activitiesData), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }


      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },

  async scheduled(event, env, ctx) {
    // Cron trigger for data refresh
    ctx.waitUntil(refreshData(env));
  }
};

async function getStatusData(env) {
  // Try to get cached data first
  const cached = await env.STATUS_KV.get('status_data');
  if (cached) {
    const data = JSON.parse(cached);
    // Return cached data if it's less than 10 minutes old
    if (Date.now() - data.lastUpdate < 600000) {
      return data;
    }
  }

  // If no cache or expired, refresh data
  return await refreshData(env);
}

async function refreshData(env) {
  const now = Date.now();

  console.log('Refreshing status data...');

  // Get current location for new activities
  const currentLocationData = await env.STATUS_KV.get('current_location');
  const currentLocation = currentLocationData ?
    JSON.parse(currentLocationData) :
    { name: 'Los Angeles, CA', coordinates: [34.0522, -118.2437], timestamp: new Date().toISOString() };

  // Fetch all data sources in parallel
  const [githubData, rssData] = await Promise.allSettled([
    fetchGitHubRSS(),
    fetchRSSFeeds()
  ]);

  // Get existing activities (immutable records)
  const existingActivities = await env.STATUS_KV.get('all_activities');
  let allActivities = existingActivities ? JSON.parse(existingActivities) : [];

  // Collect new activities to add
  const newActivities = [];

  // Process GitHub data - only add NEW items
  if (githubData.status === 'fulfilled' && githubData.value) {
    githubData.value.forEach(activity => {
      // Only add if this ID doesn't already exist
      if (!allActivities.some(existing => existing.id === activity.id)) {
        newActivities.push({
          ...activity,
          location: currentLocation.name,
          coordinates: currentLocation.coordinates,
          locationTimestamp: currentLocation.timestamp
        });
      }
    });
  }

  // Process RSS data - only add NEW items
  if (rssData.status === 'fulfilled' && rssData.value) {
    rssData.value.forEach(activity => {
      // Only add if this ID doesn't already exist
      if (!allActivities.some(existing => existing.id === activity.id)) {
        newActivities.push({
          ...activity,
          location: currentLocation.name,
          coordinates: currentLocation.coordinates,
          locationTimestamp: currentLocation.timestamp
        });
      }
    });
  }

  // Add new activities to the permanent record
  allActivities.unshift(...newActivities);

  // Sort all activities by timestamp (newest first)
  allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Build status response using current location and recent activities
  const statusData = {
    lastUpdate: now,
    location: {
      name: currentLocation.name,
      coordinates: currentLocation.coordinates,
      lastSeen: currentLocation.timestamp
    },
    activities: allActivities.slice(0, 20), // Latest 20 for main feed
    services: {
      vibecode: { status: 'operational', uptime: '99.9%', responseTime: '142ms' },
      office: { status: 'operational', uptime: '99.8%', responseTime: '89ms' },
      main: { status: 'operational', uptime: '99.9%', responseTime: '76ms' }
    }
  };

  // Cache the status response
  await env.STATUS_KV.put('status_data', JSON.stringify(statusData), {
    expirationTtl: 1800 // 30 minutes
  });

  // Store the complete immutable activity history
  await env.STATUS_KV.put('all_activities', JSON.stringify(allActivities));

  console.log('Status data refreshed:', newActivities.length, 'new activities added');
  return statusData;
}

async function fetchGitHubRSS() {
  try {
    const activities = [];

    // List of GitHub RSS feeds to monitor
    const gitHubFeeds = [
      {
        url: 'https://github.com/kmikeym/quarterly-systems-landing/commits/main.atom',
        repository: 'kmikeym/quarterly-systems-landing'
      },
      {
        url: 'https://github.com/kmikeym/quarterlykb/commits/v4.atom',
        repository: 'kmikeym/quarterlykb'
      },
      {
        url: 'https://github.com/kmikeym.atom',
        repository: 'all-repositories'
      }
    ];

    // Fetch from multiple GitHub RSS feeds
    for (const feed of gitHubFeeds) {
      try {
        const response = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Quarterly-Systems-Status/1.0'
          }
        });

        if (!response.ok) {
          console.log(`GitHub RSS feed error for ${feed.repository}: ${response.status}`);
          continue;
        }

        const xml = await response.text();
        const commits = parseGitHubRSSItems(xml, feed.repository);

        // Add commits to activities (limit to 3 per feed)
        activities.push(...commits.slice(0, 3));
      } catch (error) {
        console.error(`Error fetching GitHub RSS for ${feed.repository}:`, error);
      }
    }

    // Remove duplicates by commit ID and sort by timestamp
    const uniqueActivities = activities.filter((activity, index, self) =>
      index === self.findIndex(a => a.id === activity.id)
    );

    uniqueActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return uniqueActivities.slice(0, 10); // Return top 10 most recent
  } catch (error) {
    console.error('GitHub RSS processing error:', error);
    return [];
  }
}

async function fetchRSSFeeds() {
  const feeds = [
    {
      url: 'https://news.kmikeym.com/feed/',
      source: 'KmikeyM News',
      type: 'content'
    },
    {
      url: 'https://kmikeym.substack.com/feed',
      source: 'Substack',
      type: 'content'
    },
    {
      url: 'https://letterboxd.com/kmikeym/rss/',
      source: 'Letterboxd',
      type: 'R&D'
    },
    {
      url: 'https://bsky.app/profile/did:plc:gagojcjzqigtnzz25jmgmhgq/rss',
      source: 'Bluesky',
      type: 'content'
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
        const activityType = feed.type === 'R&D' ? 'research' : 'content';
        const activityTitle = feed.type === 'R&D' ? 'Research Activity' : 'Content Publication';
        const description = feed.type === 'R&D' ? `Watched: ${item.title}` : `Published: ${item.title}`;

        activities.push({
          id: `rss-${btoa(item.link).slice(0, 10)}`,
          type: activityType,
          title: activityTitle,
          description: description,
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

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXML = match[1];

    const title = extractXMLValue(itemXML, 'title');
    const description = extractXMLValue(itemXML, 'description');
    const link = extractXMLValue(itemXML, 'link');
    const pubDate = extractXMLValue(itemXML, 'pubDate');

    // Use description as title if title is missing (for Bluesky)
    const itemTitle = title || description || 'Post';

    if (itemTitle && link && pubDate) {
      items.push({
        title: itemTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'),
        link,
        pubDate: new Date(pubDate).toISOString()
      });
    }
  }

  return items.slice(0, 5); // Limit to 5 most recent
}

function extractXMLValue(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function parseGitHubRSSItems(xml, repositoryName) {
  const activities = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXML = match[1];

    // Extract commit data from GitHub Atom feed
    const title = extractXMLValue(entryXML, 'title');
    const updated = extractXMLValue(entryXML, 'updated') || extractXMLValue(entryXML, 'published');
    const id = extractXMLValue(entryXML, 'id');
    const author = extractXMLValue(entryXML, 'name');

    // Extract link - GitHub uses different link formats
    let link = extractXMLValue(entryXML, 'link');
    if (!link) {
      const linkMatch = entryXML.match(/<link[^>]+href="([^"]+)"/);
      link = linkMatch ? linkMatch[1] : '';
    }

    if (title && updated && id) {
      // Extract commit hash from the ID
      let commitHash = 'unknown';
      if (id.includes('Commit/')) {
        commitHash = id.split('Commit/')[1] || 'unknown';
      } else if (id.includes('push/')) {
        commitHash = id.split('push/')[1] || 'unknown';
      }

      // Clean up title
      const cleanTitle = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

      // Create activity object
      activities.push({
        id: `github-${commitHash}`,
        type: 'development',
        title: 'Development Activity',
        description: repositoryName === 'all-repositories' ?
                    `${cleanTitle}` :
                    `Pushed commit to ${repositoryName.split('/')[1] || repositoryName}`,
        timestamp: new Date(updated).toISOString(),
        source: 'GitHub',
        metadata: {
          repository: repositoryName,
          commitHash: commitHash.substring(0, 8), // Short hash
          commitMessage: cleanTitle,
          link: link,
          author: author
        }
      });
    }
  }

  return activities;
}

async function updateLocation(env, locationData) {
  const { location, activity, coordinates, timestamp } = locationData;

  // Simple location - just use what's provided (City, State format)
  const cityState = location.trim();
  const locationTimestamp = timestamp || new Date().toISOString();

  // Update current location state
  const currentLocation = {
    name: cityState,
    coordinates: coordinates || [34.0522, -118.2437], // Default to LA if no coords
    timestamp: locationTimestamp
  };

  // Store current location in its own KV key
  await env.STATUS_KV.put('current_location', JSON.stringify(currentLocation));

  // Create location activity as immutable record
  const locationActivity = {
    id: `location-${Date.now()}`,
    type: 'location',
    title: activity ? 'Activity Update' : 'Location Update',
    description: activity ? `${activity} in ${cityState}` : `Arrived in ${cityState}`,
    timestamp: locationTimestamp,
    source: 'Manual',
    location: cityState,
    coordinates: coordinates || [34.0522, -118.2437],
    locationTimestamp: locationTimestamp,
    metadata: {
      location: cityState,
      activity: activity,
      coordinates: coordinates
    }
  };

  // Get existing immutable activities
  const allActivities = await env.STATUS_KV.get('all_activities');
  let fullHistory = allActivities ? JSON.parse(allActivities) : [];

  // Add new location activity to permanent record
  fullHistory.unshift(locationActivity);

  // Sort all activities by timestamp (newest first)
  fullHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Update status data using current location and recent activities
  const statusData = {
    lastUpdate: Date.now(),
    location: {
      name: currentLocation.name,
      coordinates: currentLocation.coordinates,
      lastSeen: currentLocation.timestamp
    },
    activities: fullHistory.slice(0, 20), // Latest 20 for main feed
    services: {
      vibecode: { status: 'operational', uptime: '99.9%', responseTime: '142ms' },
      office: { status: 'operational', uptime: '99.8%', responseTime: '89ms' },
      main: { status: 'operational', uptime: '99.9%', responseTime: '76ms' }
    }
  };

  // Store both the status response and immutable activity history
  await env.STATUS_KV.put('status_data', JSON.stringify(statusData));
  await env.STATUS_KV.put('all_activities', JSON.stringify(fullHistory));

  console.log('Location updated:', cityState, 'at', locationTimestamp);
}

// Removed complex location parsing - now using simple City, State format

async function getActivitiesHistory(env, page = 1, limit = 50) {
  const allActivities = await env.STATUS_KV.get('all_activities');
  const activities = allActivities ? JSON.parse(allActivities) : [];

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedActivities = activities.slice(startIndex, endIndex);

  return {
    activities: paginatedActivities,
    pagination: {
      page: page,
      limit: limit,
      total: activities.length,
      totalPages: Math.ceil(activities.length / limit),
      hasNext: endIndex < activities.length,
      hasPrev: page > 1
    }
  };
}
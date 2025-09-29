// Quarterly Systems Status API Worker
// Aggregates real-time data from GitHub, RSS feeds, and other sources

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Enable CORS for quarterly.systems
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://quarterly.systems',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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

  // Get current location context for geo-tagging
  const cachedStatus = await env.STATUS_KV.get('status_data');
  const currentStatus = cachedStatus ? JSON.parse(cachedStatus) : {};
  const currentLocation = currentStatus.location?.city || currentStatus.location?.name || 'Los Angeles, CA';

  // Fetch all data sources in parallel
  const [githubData, rssData] = await Promise.allSettled([
    fetchGitHubActivity(env.GITHUB_TOKEN),
    fetchRSSFeeds()
  ]);

  const activities = [];

  // Process GitHub data with location context
  if (githubData.status === 'fulfilled' && githubData.value) {
    const geoTaggedGithub = githubData.value.map(activity => ({
      ...activity,
      location: currentLocation
    }));
    activities.push(...geoTaggedGithub);
  }

  // Process RSS data with location context
  if (rssData.status === 'fulfilled' && rssData.value) {
    const geoTaggedRSS = rssData.value.map(activity => ({
      ...activity,
      location: currentLocation
    }));
    activities.push(...geoTaggedRSS);
  }

  // Sort activities by timestamp (newest first)
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const statusData = {
    lastUpdate: now,
    location: {
      name: 'Los Angeles, CA',
      coordinates: [34.0522, -118.2437],
      lastSeen: new Date(now - 7200000).toISOString() // 2 hours ago
    },
    activities: activities.slice(0, 10), // Keep only latest 10
    services: {
      vibecode: { status: 'operational', uptime: '99.9%', responseTime: '142ms' },
      office: { status: 'operational', uptime: '99.8%', responseTime: '89ms' },
      main: { status: 'operational', uptime: '99.9%', responseTime: '76ms' }
    }
  };

  // Cache the data
  await env.STATUS_KV.put('status_data', JSON.stringify(statusData), {
    expirationTtl: 1800 // 30 minutes
  });

  // Update full activity history with new activities
  const allActivities = await env.STATUS_KV.get('all_activities');
  let fullHistory = allActivities ? JSON.parse(allActivities) : [];

  // Add new activities to history (avoid duplicates by checking IDs)
  activities.forEach(activity => {
    if (!fullHistory.some(existing => existing.id === activity.id)) {
      fullHistory.unshift(activity);
    }
  });

  await env.STATUS_KV.put('all_activities', JSON.stringify(fullHistory));

  console.log('Status data refreshed:', activities.length, 'activities');
  return statusData;
}

async function fetchGitHubActivity(token) {
  if (!token) {
    console.log('No GitHub token provided');
    return [];
  }

  try {
    const activities = [];

    // Fetch recent commits from user's public activity
    const eventsResponse = await fetch('https://api.github.com/users/kmikeym/events/public', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Quarterly-Systems-Status/1.0'
      }
    });

    if (!eventsResponse.ok) {
      throw new Error(`GitHub API error: ${eventsResponse.status}`);
    }

    const events = await eventsResponse.json();

    for (const event of events.slice(0, 5)) {
      if (event.type === 'PushEvent') {
        activities.push({
          id: `github-${event.id}`,
          type: 'development',
          title: 'Development Activity',
          description: `Pushed ${event.payload.commits?.length || 1} commit(s) to ${event.repo.name}`,
          timestamp: event.created_at,
          source: 'GitHub',
          metadata: {
            repository: event.repo.name,
            commits: event.payload.commits?.length || 1
          }
        });
      } else if (event.type === 'ReleaseEvent') {
        activities.push({
          id: `github-release-${event.id}`,
          type: 'deployment',
          title: 'Release Published',
          description: `Released ${event.payload.release.tag_name} for ${event.repo.name}`,
          timestamp: event.created_at,
          source: 'GitHub',
          metadata: {
            repository: event.repo.name,
            version: event.payload.release.tag_name
          }
        });
      }
    }

    return activities;
  } catch (error) {
    console.error('GitHub API error:', error);
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
        activities.push({
          id: `rss-${btoa(item.link).slice(0, 10)}`,
          type: 'content',
          title: 'Content Publication',
          description: `Published: ${item.title}`,
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
    const link = extractXMLValue(itemXML, 'link');
    const pubDate = extractXMLValue(itemXML, 'pubDate');

    if (title && link && pubDate) {
      items.push({
        title: title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'),
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

async function updateLocation(env, locationData) {
  const { location, activity, coordinates, timestamp } = locationData;

  // Parse location for different display levels
  const { exactAddress, neighborhood, city } = parseLocationLevels(location);

  // Update current location in status data
  const cachedStatus = await env.STATUS_KV.get('status_data');
  let statusData = cachedStatus ? JSON.parse(cachedStatus) : {};

  // Store full location data with different levels
  statusData.location = {
    exact: exactAddress,           // Full address (private)
    neighborhood: neighborhood,    // For map display
    city: city,                   // For activity feed
    coordinates: coordinates || [34.0522, -118.2437], // Default to LA if no coords
    lastSeen: timestamp || new Date().toISOString()
  };

  // Create location activity using city-level location
  const locationActivity = {
    id: `location-${Date.now()}`,
    type: 'location',
    title: activity ? 'Activity Update' : 'Location Update',
    description: activity ? `${activity} in ${city}` : `Arrived in ${city}`,
    timestamp: timestamp || new Date().toISOString(),
    source: 'Manual',
    location: city, // Public activities use city-level
    metadata: {
      location: city,
      activity: activity,
      coordinates: coordinates
    }
  };

  // Add to activities (if they exist)
  if (!statusData.activities) {
    statusData.activities = [];
  }

  // Add location activity to beginning and keep only latest 10 for main feed
  statusData.activities.unshift(locationActivity);
  statusData.activities = statusData.activities.slice(0, 10);

  // Store all activities in separate key for history
  const allActivities = await env.STATUS_KV.get('all_activities');
  let fullHistory = allActivities ? JSON.parse(allActivities) : [];
  fullHistory.unshift(locationActivity);

  // Update both caches
  statusData.lastUpdate = Date.now();
  await env.STATUS_KV.put('status_data', JSON.stringify(statusData));
  await env.STATUS_KV.put('all_activities', JSON.stringify(fullHistory));

  console.log('Location updated:', location, 'at', timestamp);
}

function parseLocationLevels(locationInput) {
  // Handle different input formats and extract appropriate levels
  const input = locationInput.trim();

  // If it contains a comma, assume it's in format like "123 Main St, West Hollywood, Los Angeles, CA"
  if (input.includes(',')) {
    const parts = input.split(',').map(part => part.trim());

    if (parts.length >= 4) {
      // Full address format: "123 Main St, West Hollywood, Los Angeles, CA"
      return {
        exactAddress: input,                           // Full address
        neighborhood: parts[1],                        // West Hollywood
        city: `${parts[2]}, ${parts[3]}`              // Los Angeles, CA
      };
    } else if (parts.length === 3) {
      // Format: "West Hollywood, Los Angeles, CA"
      return {
        exactAddress: input,
        neighborhood: parts[0],                        // West Hollywood
        city: `${parts[1]}, ${parts[2]}`              // Los Angeles, CA
      };
    } else if (parts.length === 2) {
      // City, State format: "Los Angeles, CA"
      return {
        exactAddress: input,
        neighborhood: parts[0],                        // Los Angeles
        city: input                                    // Los Angeles, CA
      };
    }
  }

  // Single location (city name, neighborhood, etc.)
  return {
    exactAddress: input,
    neighborhood: input,
    city: input
  };
}

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
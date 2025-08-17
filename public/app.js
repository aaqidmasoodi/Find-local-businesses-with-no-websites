// API key will be fetched from backend
let GOOGLE_API_KEY = null;

document.addEventListener('DOMContentLoaded', () => {
  // Check if we're running with backend support
  checkBackendSupport().then(() => {
    // Load saved state from localStorage
    loadState();
    
    const isDesktop = window.innerWidth >= 1024;
    setupLayout(isDesktop);
    
    // Add resize listener with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newIsDesktop = window.innerWidth >= 1024;
        const currentIsDesktop = document.querySelector('.layout.desktop').style.display !== 'none';
        
        if (newIsDesktop !== currentIsDesktop) {
          setupLayout(newIsDesktop);
        }
      }, 250);
    });
  });
});

async function checkBackendSupport() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (!config.hasApiKey) {
      console.warn('Google API key not configured on server');
      // You might want to show a warning to the user
    }
  } catch (error) {
    console.log('Running in pure frontend mode');
  }
}

function setupLayout(isDesktop) {
  const desktopLayout = document.querySelector('.layout.desktop');
  const mobileLayout = document.querySelector('.layout.mobile');
  
  if (isDesktop) {
    desktopLayout.style.display = 'flex';
    mobileLayout.style.display = 'none';
    setupDesktop();
  } else {
    desktopLayout.style.display = 'none';
    mobileLayout.style.display = 'flex';
    setupMobile();
  }
}

function loadState() {
  // Load search parameters
  const savedLocation = localStorage.getItem('searchLocation');
  const savedRadius = localStorage.getItem('searchRadius');
  const savedTypes = localStorage.getItem('searchTypes');
  
  if (savedLocation) {
    document.getElementById('location').value = savedLocation;
    document.getElementById('mobile-location').value = savedLocation;
  }
  
  if (savedRadius) {
    const radius = parseInt(savedRadius);
    document.getElementById('radius').value = radius;
    document.getElementById('radius-value').textContent = radius;
    document.getElementById('mobile-radius').value = radius;
    document.getElementById('mobile-radius-value').textContent = radius;
  }
  
  if (savedTypes) {
    const types = JSON.parse(savedTypes);
    document.querySelectorAll('.categories input').forEach(checkbox => {
      checkbox.checked = types.includes(checkbox.value);
    });
  }
}

function saveState(location, radius, types) {
  localStorage.setItem('searchLocation', location);
  localStorage.setItem('searchRadius', radius.toString());
  localStorage.setItem('searchTypes', JSON.stringify(types));
}

let currentResults = [];

function setupDesktop() {
  const searchBtn = document.getElementById('search-btn');
  const radiusSlider = document.getElementById('radius');
  const radiusValue = document.getElementById('radius-value');
  const locationInput = document.getElementById('location');

  radiusSlider.addEventListener('input', () => {
    radiusValue.textContent = radiusSlider.value;
  });

  searchBtn.addEventListener('click', () => {
    const location = locationInput.value;
    const radius = radiusSlider.value * 1000;
    const types = Array.from(document.querySelectorAll('.categories input:checked')).map(cb => cb.value);

    if (!location.trim()) {
      alert('Please enter a location');
      return;
    }

    saveState(location, parseInt(radiusSlider.value), types);
    geocodeAndSearch(location, radius, types);
  });

  // If we have saved results, display them
  if (currentResults.length > 0) {
    renderDesktopTable(currentResults);
  }
}

function setupMobile() {
  const searchBtn = document.getElementById('mobile-search-btn');
  const radiusSlider = document.getElementById('mobile-radius');
  const radiusValue = document.getElementById('mobile-radius-value');
  const locationInput = document.getElementById('mobile-location');
  const exportBtn = document.getElementById('export-btn');

  radiusSlider.addEventListener('input', () => {
    radiusValue.textContent = radiusSlider.value;
  });

  searchBtn.addEventListener('click', () => {
    const location = locationInput.value;
    const radius = radiusSlider.value * 1000;
    const types = Array.from(document.querySelectorAll('.categories input:checked')).map(cb => cb.value);

    if (!location.trim()) {
      alert('Please enter a location');
      return;
    }

    saveState(location, parseInt(radiusSlider.value), types);
    geocodeAndSearch(location, radius, types, true);
  });

  exportBtn.addEventListener('click', () => {
    exportResults();
  });

  // If we have saved results, display them
  if (currentResults.length > 0) {
    renderMobileResults(currentResults);
  }
}

// Fetch function that uses backend proxy when available
async function fetchWithProxy(url) {
  // Try backend proxy first (keeps API key secure)
  try {
    const proxyUrl = `/api/google-proxy?url=${encodeURIComponent(url)}`;
    const proxyResponse = await fetch(proxyUrl);
    if (proxyResponse.ok) {
      return await proxyResponse.json();
    }
  } catch (proxyError) {
    console.log('Backend proxy failed, trying direct fetch');
  }
  
  // Fall back to direct fetch (for pure frontend mode)
  try {
    const directResponse = await fetch(url);
    if (directResponse.ok) {
      return await directResponse.json();
    }
  } catch (directError) {
    console.log('Direct fetch failed');
  }
  
  throw new Error('All fetch methods failed');
}

async function geocodeAndSearch(query, radius, types, isMobile = false) {
  // Show loading state
  const searchBtn = document.getElementById('search-btn') || document.getElementById('mobile-search-btn');
  const originalText = searchBtn.textContent;
  searchBtn.textContent = 'Searching...';
  searchBtn.disabled = true;

  // Show loading in results area
  if (isMobile) {
    const resultsContainer = document.getElementById('mobile-results');
    resultsContainer.innerHTML = '<div class="loading">Searching for businesses...</div>';
  } else {
    const tbody = document.querySelector('#results-table tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Searching for businesses...</td></tr>';
  }

  try {
    // First geocode the location
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}`;
    const geocodeData = await fetchWithProxy(geocodeUrl);

    if (geocodeData.status !== 'OK' || geocodeData.results.length === 0) {
      throw new Error('Location not found: ' + (geocodeData.status || 'No results'));
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;
    
    // Search for businesses with proper cumulative radius handling
    const businesses = await searchBusinessesCumulative(lat, lng, radius, types);
    currentResults = businesses;
    
    if (isMobile) {
      renderMobileResults(businesses);
    } else {
      renderDesktopTable(businesses);
    }
  } catch (err) {
    console.error('Search error:', err);
    const errorMessage = err.message.includes('fetch') ? 
      'Network error. Make sure you\'re running the local server.' : 
      err.message;
    
    // Show error in results area
    if (isMobile) {
      const resultsContainer = document.getElementById('mobile-results');
      resultsContainer.innerHTML = `<div class="empty-state">Error: ${errorMessage}</div>`;
    } else {
      const tbody = document.querySelector('#results-table tbody');
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error: ${errorMessage}</td></tr>`;
    }
  } finally {
    // Restore button state
    searchBtn.textContent = originalText;
    searchBtn.disabled = false;
  }
}

// Proper cumulative radius handling - ensures larger radii include smaller ones
async function searchBusinessesCumulative(lat, lng, maxRadius, types) {
  const businesses = [];
  const seenPlaceIds = new Set();

  for (const type of types) {
    try {
      console.log(`Searching for type: ${type} within ${maxRadius/1000}km`);
      
      // For larger radii, we need to make multiple requests to capture all results
      // Google Places API limits to ~60 results per search
      const radiiToCheck = [];
      
      // Always check 1km to ensure we get close businesses
      radiiToCheck.push(1000);
      
      // For larger radii, check in increments but cap at maxRadius
      if (maxRadius > 1000) {
        // Check at 25%, 50%, 75% and 100% of max radius
        const increments = [Math.floor(maxRadius * 0.25), Math.floor(maxRadius * 0.5), Math.floor(maxRadius * 0.75), maxRadius];
        radiiToCheck.push(...increments);
      } else {
        radiiToCheck.push(maxRadius);
      }
      
      // Remove duplicates and sort
      const uniqueRadii = [...new Set(radiiToCheck)].sort((a, b) => a - b);
      
      console.log(`Checking radii: ${uniqueRadii.map(r => r/1000 + 'km').join(', ')}`);

      for (const radius of uniqueRadii) {
        // Skip if this radius exceeds our max
        if (radius > maxRadius) continue;
        
        try {
          const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}`;
          const searchData = await fetchWithProxy(searchUrl);

          if (searchData.status === 'OK') {
            console.log(`Found ${searchData.results?.length || 0} results at ${radius/1000}km for ${type}`);
            
            for (const place of searchData.results || []) {
              // Skip if we've already seen this place
              if (seenPlaceIds.has(place.place_id)) continue;
              seenPlaceIds.add(place.place_id);

              try {
                // Get place details
                const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,geometry`;
                const detailData = await fetchWithProxy(detailUrl);
                const details = detailData.result || {};

                // Only include businesses without websites
                if (!details.website) {
                  const distance = calculateDistance(
                    lat, 
                    lng, 
                    details.geometry?.location?.lat, 
                    details.geometry?.location?.lng
                  );

                  // Only include if within the requested max radius
                  if (distance <= (maxRadius / 1000)) {
                    // Create proper Google Maps URLs that work on both web and mobile
                    // Web URL - opens in browser
                    const webUrl = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
                    // Mobile app URL - opens in Google Maps app if available
                    const mobileUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.name || place.name || 'Business')}&query_place_id=${place.place_id}`;
                    
                    businesses.push({
                      name: details.name || 'N/A',
                      phone: details.formatted_phone_number || 'N/A',
                      address: details.formatted_address || 'N/A',
                      category: type,
                      distance: distance,
                      place_id: place.place_id,
                      google_profile_url: webUrl,
                      google_maps_app_url: mobileUrl
                    });
                  }
                }
              } catch (detailErr) {
                console.error('Error fetching place details:', detailErr);
                // Still include the place with basic info if details fail
                const distance = calculateDistance(
                  lat, 
                  lng, 
                  place.geometry?.location?.lat, 
                  place.geometry?.location?.lng
                );
                
                if (distance <= (maxRadius / 1000)) {
                  // Create proper Google Maps URLs that work on both web and mobile
                  const webUrl = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
                  const mobileUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || 'Business')}&query_place_id=${place.place_id}`;
                  
                  businesses.push({
                    name: place.name || 'N/A',
                    phone: 'N/A',
                    address: place.vicinity || 'N/A',
                    category: type,
                    distance: distance,
                    place_id: place.place_id,
                    google_profile_url: webUrl,
                    google_maps_app_url: mobileUrl
                  });
                }
              }
            }
          } else if (searchData.status === 'ZERO_RESULTS') {
            console.log(`No results at ${radius/1000}km for type: ${type}`);
            continue;
          } else {
            console.warn('API returned status:', searchData.status);
            continue;
          }
        } catch (radiusError) {
          console.error(`Error at radius ${radius/1000}km for type ${type}:`, radiusError);
          continue;
        }
      }
    } catch (err) {
      console.error('Error searching for type', type, err);
      continue;
    }
  }

  // Remove duplicates (in case same business appears in multiple radius checks)
  const uniqueBusinesses = [];
  const processedIds = new Set();
  
  for (const business of businesses) {
    if (!processedIds.has(business.place_id)) {
      uniqueBusinesses.push(business);
      processedIds.add(business.place_id);
    }
  }

  // Sort by distance
  uniqueBusinesses.sort((a, b) => a.distance - b.distance);
  console.log('Total unique businesses found:', uniqueBusinesses.length);
  return uniqueBusinesses;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat2 === undefined || lon2 === undefined) return Infinity;
  
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function renderDesktopTable(results) {
  const tbody = document.querySelector('#results-table tbody');
  tbody.innerHTML = '';

  if (results.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="empty-state">No businesses found without websites</td>';
    tbody.appendChild(row);
    return;
  }

  results.forEach(biz => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><a href="${biz.google_profile_url}" target="_blank" rel="noopener noreferrer">${biz.name}</a></td>
      <td>${biz.category}</td>
      <td>${biz.distance.toFixed(2)}</td>
      <td>${biz.phone}</td>
      <td>${biz.address}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderMobileResults(results) {
  const container = document.getElementById('mobile-results');
  container.innerHTML = '';

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state">No businesses found without websites</div>';
    return;
  }

  results.forEach(biz => {
    const div = document.createElement('div');
    div.className = 'business-card';
    div.innerHTML = `
      <strong><a href="${biz.google_maps_app_url}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: none;">${biz.name}</a></strong> 
      <span style="color: #666;">(${biz.category})</span><br/>
      <span style="color: #28a745;">${biz.distance.toFixed(2)} km</span> away<br/>
      <span style="color: #007bff;">📞 ${biz.phone}</span><br/>
      <small>📍 ${biz.address}</small><br/>
      <a href="${biz.google_maps_app_url}" target="_blank" rel="noopener noreferrer" style="color: #6c757d; font-size: 0.9em;">View on Google Maps</a>
    `;
    container.appendChild(div);
  });
}

function exportResults() {
  if (!currentResults.length) {
    alert('No data to export');
    return;
  }

  const headers = ['Name', 'Category', 'Distance (km)', 'Phone', 'Address', 'Google Profile URL'];
  const csvContent = [
    headers.join(','),
    ...currentResults.map(b => [
      `"${b.name}"`,
      b.category,
      b.distance.toFixed(2),
      `"${b.phone}"`,
      `"${b.address}"`,
      `"${b.google_profile_url}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'businesses.csv';
  link.click();
}
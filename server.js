const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, './config/.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to get API key configuration
app.get('/api/config', (req, res) => {
  const hasApiKey = !!process.env.GOOGLE_PLACES_API_KEY;
  res.json({
    hasApiKey: hasApiKey,
    // Don't send the actual key to frontend for security
  });
});

// Proxy endpoint for Google API calls (keeps key secure)
app.get('/api/google-proxy', async (req, res) => {
  const { url } = req.query;
  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  
  if (!API_KEY) {
    return res.status(500).json({ error: 'Google API key not configured on server' });
  }

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Add API key to Google URLs
    let finalUrl = url;
    if (url.includes('maps.googleapis.com') && !url.includes('key=')) {
      finalUrl = url + (url.includes('?') ? '&' : '?') + `key=${API_KEY}`;
    }

    const response = await fetch(finalUrl);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Proxy request failed: ' + error.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
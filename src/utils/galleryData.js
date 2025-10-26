// Utility to fetch and parse Google Sheets CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRGhL2d3ZiPA5jvRfy3AnfvjbrRZ9dLVFrJQuzCT40MR2f6iB5iHfDSQ3xwUEo0CFnEooiEx80_y0wg/pub?output=csv';

export const fetchGalleryData = async () => {
  try {
    const response = await fetch(SHEET_CSV_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status}`);
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    // Filter for images, gifs, and videos, extract src
    const mediaItems = rows
      .filter(row => row.media_type === 'image' || row.media_type === 'gif' || row.media_type === 'video')
      .map(row => ({
        id: row.id,
        src: row.src,
        alt: row.alt || 'Gallery item',
        mediaType: row.media_type,
        aspectRatio: row.aspect_ratio,
        width: row.width,
        height: row.height,
        client: row.client,
        project: row.project,
        category: row.category,
        discipline: row.discipline
      }))
      .filter(item => item.src); // Only include items with valid src

    return mediaItems;
  } catch (error) {
    console.error('Error fetching gallery data:', error);
    throw error;
  }
};

// Simple CSV parser
const parseCSV = (csvText) => {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
};

// Parse CSV line handling quotes properly
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

// Determine if an item should be wide (span 2 columns)
// 20% of items are wide (every 5th item)
export const isWideItem = (index) => {
  return index % 5 === 0;
};

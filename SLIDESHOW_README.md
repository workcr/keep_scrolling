# Portfolio Slideshow - p5.js Implementation

## Overview

This is a p5.js-powered slideshow that recreates the visual aesthetic of the original scroll-based carousel, but as an auto-playing rapid stacking animation. Images and videos appear every 0.5 seconds, creating a fast-paced, growing stack effect.

## Features

✅ **Rapid Stacking Animation** - New items appear every 0.5 seconds
✅ **Google Sheets Integration** - Load media URLs from a published Google Sheet
✅ **Mixed Media Support** - Displays both images and videos
✅ **Auto-detect Media Type** - Automatically detects images vs videos from file extension
✅ **Memory Management** - Automatically removes old items after 25 new items are loaded
✅ **Infinite Loop** - Seamlessly loops back to first item after the last
✅ **Video Handling** - Videos autoplay, loop, and remain muted
✅ **Auto-start** - Animation begins automatically on page load
✅ **p5.js Canvas** - Uses p5.js for animation timing and visual effects

## How to Use

### Option 1: Demo Mode (Local Images)

1. Open `slideshow.html` in your browser
2. The slideshow will automatically start after 1 second using local demo images from the `assets` folder

### Option 2: Google Sheets Integration

1. **Create a Google Sheet** with media URLs:
   - Column A: Media URL (full URL to image or video)
   - Row 1: Header (will be skipped)
   - Rows 2+: Your media URLs

   Example:
   ```
   Media URL
   https://example.com/image1.jpg
   https://example.com/video1.mp4
   https://example.com/image2.png
   ```

2. **Publish your sheet to the web:**
   - In Google Sheets: File → Share → Publish to web
   - Choose "Entire Document" and "Web page"
   - Click "Publish"
   - Copy the URL

3. **Load in the slideshow:**
   - Paste the Google Sheets URL in the input field
   - Click "Load" or press Enter
   - The slideshow will start automatically

## Configuration

You can adjust timing and memory settings by editing the `CONFIG` object in the HTML file:

```javascript
const CONFIG = {
    displayDuration: 500,     // Time per item in milliseconds (default: 0.5s)
    maxItemsInMemory: 25,     // Max items before cleanup (default: 25)
    autoStartDelay: 1000      // Delay before auto-start in demo mode (default: 1s)
};
```

## Supported Media Types

### Images
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`

### Videos
- `.mp4`, `.webm`, `.ogg`, `.mov`
- Videos automatically:
  - Autoplay
  - Loop
  - Muted
  - Play inline on mobile

## Technical Details

### Architecture
- **p5.js** - Animation loop and timing control
- **DOM Elements** - Media rendering for optimal video performance
- **Google Sheets API** - CSV export endpoint for data loading
- **Vanilla JavaScript** - No additional dependencies

### Performance
- **Memory Management**: Automatically removes DOM elements after 25 items
- **Passive Rendering**: p5.js canvas provides subtle background effect
- **Efficient Loading**: Media elements created on-demand

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Video autoplay requires user interaction on some mobile browsers

## File Structure

```
keep_scrolling/
├── slideshow.html              # Main slideshow file
├── SLIDESHOW_README.md         # This file
├── assets/                     # Demo images
│   ├── dtms_portfolio_10-640.webp
│   ├── dtms_portfolio_02-960p.gif
│   └── ...
└── dist/                       # Original portfolio site
```

## Troubleshooting

### Google Sheets not loading?
- Make sure the sheet is **published to web** (File → Share → Publish to web)
- Check that the URL is a valid Google Sheets URL
- Verify Column A contains valid media URLs
- Check browser console for error messages

### Videos not playing?
- Ensure video URLs are publicly accessible
- Check video format is supported (.mp4 recommended)
- Some browsers block autoplay - try clicking on the page first

### Items loading too fast/slow?
- Adjust `CONFIG.displayDuration` in the code (value in milliseconds)
- 500ms = 0.5 seconds (default)
- 1000ms = 1 second

## Development

The slideshow uses:
- **p5.js 1.7.0** (loaded from CDN)
- **Instance mode** for better encapsulation
- **requestAnimationFrame** via p5.js draw loop for smooth timing

## Credits

Created for the "Keep Scrolling" portfolio by Rodrigo Mendes
Based on the original scroll-based carousel animation

## License

This implementation is provided as-is for portfolio and educational use.

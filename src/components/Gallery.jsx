import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchGalleryData, isWideItem } from '../utils/galleryData'
import './Gallery.css'

function Gallery() {
  const [galleryItems, setGalleryItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const gridRef = useRef(null)

  // Add autoplay parameters to video URL
  const getVideoUrl = (src) => {
    if (!src) return src

    const separator = src.includes('?') ? '&' : '?'
    return `${src}${separator}autoplay=1&muted=1&loop=1&background=1`
  }

  // Fetch gallery data from Google Sheets on mount
  useEffect(() => {
    const loadGalleryData = async () => {
      try {
        setLoading(true)
        const items = await fetchGalleryData()
        setGalleryItems(items)
        setError(null)
      } catch (err) {
        setError('Failed to load gallery. Please try again later.')
        console.error('Gallery load error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadGalleryData()
  }, [])

  const resizeGridItem = (item) => {
    if (!item) return

    const grid = gridRef.current
    if (!grid) return

    const rowHeight = 10 // matches grid-auto-rows
    const rowGap = 20 // matches gap

    // Check for both images and video containers
    const img = item.querySelector('img')
    const video = item.querySelector('.video-container')

    let contentHeight = 0

    if (img && img.complete) {
      contentHeight = img.getBoundingClientRect().height
    } else if (video) {
      contentHeight = video.getBoundingClientRect().height
    } else {
      return
    }

    const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap))
    item.style.gridRowEnd = `span ${rowSpan}`
  }

  const handleImageLoad = (event, index) => {
    setLoadedImages(prev => new Set([...prev, index]))

    // Calculate and set the row span for this item
    const item = event.target.parentElement
    resizeGridItem(item)
  }

  // Recalculate on window resize and when items are loaded
  useEffect(() => {
    const resizeAllGridItems = () => {
      if (!gridRef.current) return
      const items = gridRef.current.querySelectorAll('.masonry-item')
      items.forEach(item => resizeGridItem(item))
    }

    window.addEventListener('resize', resizeAllGridItems)
    return () => window.removeEventListener('resize', resizeAllGridItems)
  }, [])

  // Resize grid items when gallery items are loaded
  useEffect(() => {
    if (galleryItems.length > 0) {
      // Wait for videos to be rendered
      setTimeout(() => {
        if (!gridRef.current) return
        const items = gridRef.current.querySelectorAll('.masonry-item')
        items.forEach(item => resizeGridItem(item))
      }, 100)
    }
  }, [galleryItems])

  return (
    <div className="gallery-container">
      <header className="gallery-header">
        <Link to="/" className="back-link">← Back</Link>
        <h1>Gallery</h1>
      </header>

      {loading && (
        <div className="gallery-loading">
          <p>Loading gallery...</p>
        </div>
      )}

      {error && (
        <div className="gallery-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="masonry-grid" ref={gridRef}>
          {galleryItems.map((item, index) => (
            <div
              key={item.id || index}
              className={`masonry-item ${isWideItem(index) ? 'wide' : ''} ${
                loadedImages.has(index) ? 'loaded' : ''
              }`}
            >
              {item.mediaType === 'video' ? (
                <div className="video-container" style={{ aspectRatio: item.aspectRatio || '16 / 9' }}>
                  <iframe
                    src={getVideoUrl(item.src)}
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    title={item.alt}
                    onLoad={() => {
                      setLoadedImages(prev => new Set([...prev, index]))
                      const container = document.querySelector(`[data-index="${index}"]`)
                      if (container) resizeGridItem(container.parentElement)
                    }}
                  ></iframe>
                </div>
              ) : (
                <img
                  src={`/${item.src}`}
                  alt={item.alt}
                  loading="lazy"
                  onLoad={(e) => handleImageLoad(e, index)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Gallery

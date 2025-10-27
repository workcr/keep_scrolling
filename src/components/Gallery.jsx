import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchGalleryData, isWideItem } from '../utils/galleryData'
import './Gallery.css'

function Gallery() {
  const [allItems, setAllItems] = useState([]) // All items from sheet
  const [displayedItems, setDisplayedItems] = useState([]) // Items currently shown
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const [startIndex, setStartIndex] = useState(0) // Where we are in the infinite sequence
  const [isLoadingMore, setIsLoadingMore] = useState(false) // Prevent double-loading
  const gridRef = useRef(null)
  const sentinelRef = useRef(null)
  const lastLoadedCount = useRef(0) // Track items count to know which are new

  const INITIAL_LOAD = 30 // Load first 30 items
  const BATCH_SIZE = 8 // Load 8 more when scrolling (smaller = smoother)

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
        setAllItems(items)

        // Load initial batch with infinite sequence metadata
        const initialItems = []
        for (let i = 0; i < INITIAL_LOAD; i++) {
          initialItems.push({
            ...items[i % items.length],
            sequenceIndex: i // Track position in infinite sequence
          })
        }
        setDisplayedItems(initialItems)
        setStartIndex(INITIAL_LOAD)
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

  const handleImageLoad = (event, sequenceIndex) => {
    setLoadedImages(prev => new Set([...prev, sequenceIndex]))

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

  // Load more items (infinite scroll - just append, never remove)
  const loadMoreItems = () => {
    if (allItems.length === 0 || isLoadingMore) return

    setIsLoadingMore(true)

    requestAnimationFrame(() => {
      setDisplayedItems(prev => {
        // Create new batch with sequence tracking
        const newBatch = []
        for (let i = 0; i < BATCH_SIZE; i++) {
          const seqIndex = startIndex + i
          newBatch.push({
            ...allItems[seqIndex % allItems.length],
            sequenceIndex: seqIndex
          })
        }

        // Just append - never remove items (lazy loading handles off-screen images)
        return [...prev, ...newBatch]
      })

      setStartIndex(prev => prev + BATCH_SIZE)

      setTimeout(() => setIsLoadingMore(false), 100)
    })
  }

  // Set up Intersection Observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || allItems.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          loadMoreItems()
        }
      },
      {
        threshold: 0,
        rootMargin: '1200px' // Trigger well before end for seamless loading
      }
    )

    observer.observe(sentinelRef.current)

    return () => observer.disconnect()
  }, [allItems, startIndex, isLoadingMore])

  // Resize ONLY new items when they're added
  useEffect(() => {
    if (displayedItems.length > 0 && displayedItems.length > lastLoadedCount.current) {
      // Small delay to let DOM update
      const timer = setTimeout(() => {
        if (!gridRef.current) return
        const allItemElements = gridRef.current.querySelectorAll('.masonry-item')

        // Only resize the NEW items (from lastLoadedCount to current length)
        const startIdx = lastLoadedCount.current
        const newItems = Array.from(allItemElements).slice(startIdx)
        newItems.forEach(item => resizeGridItem(item))

        lastLoadedCount.current = displayedItems.length
      }, 50)

      return () => clearTimeout(timer)
    }
  }, [displayedItems.length])

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
        <>
          <div className="masonry-grid" ref={gridRef}>
            {displayedItems.map((item, index) => (
              <div
                key={`item-${item.sequenceIndex}`}
                className={`masonry-item ${isWideItem(item.sequenceIndex) ? 'wide' : ''} ${
                  loadedImages.has(item.sequenceIndex) ? 'loaded' : ''
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
                        setLoadedImages(prev => new Set([...prev, item.sequenceIndex]))
                        // Resize this item after video loads
                        setTimeout(() => {
                          if (gridRef.current) {
                            const items = gridRef.current.querySelectorAll('.masonry-item')
                            items.forEach(gridItem => {
                              const video = gridItem.querySelector('.video-container')
                              if (video) resizeGridItem(gridItem)
                            })
                          }
                        }, 100)
                      }}
                    ></iframe>
                  </div>
                ) : (
                  <img
                    src={`/${item.src}`}
                    alt={item.alt}
                    loading="lazy"
                    style={{
                      aspectRatio: item.aspectRatio || 'auto',
                      minHeight: item.aspectRatio ? `${300 / parseFloat(item.aspectRatio || '1')}px` : '200px'
                    }}
                    onLoad={(e) => handleImageLoad(e, item.sequenceIndex)}
                  />
                )}
              </div>
            ))}
          </div>
          {/* Sentinel element for infinite scroll */}
          <div ref={sentinelRef} className="scroll-sentinel" style={{ height: '20px' }} />
        </>
      )}
    </div>
  )
}

export default Gallery

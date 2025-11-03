# Home Section Scroll Animation - Technical Description

## Overview
The home section features an interactive scroll-based carousel animation that creates a vertical slideshow experience. As users scroll down the page, portfolio items smoothly transition in and out with dynamic opacity and z-index changes.

## Visual Experience

### Initial State
When the page loads, users see:
- **Text prompt**: Large text reading "Scroll" (text-3xl / 1.875rem)
- **Visual indicators**: Three downward arrow symbols (↓↓↓) arranged vertically
- **Call-to-action image**: A "Keep scrolling" image positioned at the bottom of the viewport (bottom-6, w-11/12)
- All these elements are fixed and centered on the screen

### Scroll Interaction
As the user scrolls down the page:

1. **Dynamic Height Container**: The scroll area has a height calculated as `n × 100dvh` where `n` is the number of portfolio items
   - Uses dynamic viewport height (dvh) for consistent sizing across devices

2. **Item Transitions**: Each portfolio item undergoes coordinated animations:
   - **Opacity Fade**: Items smoothly fade in/out based on scroll position
     - Formula: `Hg + scrollProgress * (1 - Hg)` where Hg appears to be a minimum opacity value
   - **Z-Index Stacking**: Active items get z-index of 20, inactive items get z-index of 5 or 1
   - **Position**: Items are relatively positioned with centered alignment

3. **Scroll Progress Calculation**:
   ```
   scrollPosition = scroll * n % n  // Normalized scroll position
   currentIndex = Math.floor(scrollPosition)  // Current item index
   transitionProgress = scrollPosition - currentIndex  // Progress between items (0-1)
   ```

4. **Item Visibility Logic**:
   - When `currentIndex === itemIndex`: Item is fully visible (opacity reaches 1.0)
   - Edge case handling: Last item (`n-1`) wraps to first item (index 0)
   - Items ahead of current position fade out (opacity → 0)
   - Smooth interpolation between states

## Technical Implementation

### Technology Stack
- **Framework**: React 19.1.1
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom CSS variables
- **Scroll Handling**: Native scroll events with passive listeners

### Key Components

#### 1. Scroll Event Listener
```javascript
addEventListener("scroll", scrollHandler, {passive: true})
```
- Uses `passive: true` for optimized scroll performance
- No scroll prevention, allows smooth native scrolling

#### 2. Container Structure
```javascript
className="carrousel-container"
```
- Main carousel container element
- Contains fixed UI prompts and scrollable content area

#### 3. Fixed UI Elements
- **Prompt container**: `flex items-center justify-center h-full fixed w-full`
- **Text styling**: `text-3xl flex flex-col gap-6`
- **Image container**: `fixed bottom-6 left-0 flex items-center justify-center w-full`

#### 4. Portfolio Item Styling
```javascript
{
  position: "relative",
  width: maxW || "80%",
  height: maxH || "auto",
  maxWidth: "96vw",
  maxHeight: "96dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transformOrigin: "center center"
}
```

### CSS Variables & Transitions
- **Transition Duration**: 0.15s - 0.3s
- **Easing Function**: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)
- **Transition Properties**: `width, opacity`
- **Smooth Scrolling**: `scroll-behavior: smooth` on body element

## Animation Characteristics

### Performance Optimizations
1. **Passive Event Listeners**: Scroll events don't block scrolling
2. **Hardware Acceleration**: Likely uses CSS transforms (not visible in minified code)
3. **Efficient Calculations**: Modulo arithmetic for smooth looping
4. **Minimal Reflows**: Changes limited to opacity and z-index

### User Experience
- **Intuitive**: Clear "Scroll" prompt with visual arrows
- **Smooth**: CSS transitions with optimized easing curves
- **Responsive**: Uses viewport units (dvh) for consistent sizing
- **Engaging**: Each portfolio piece gets full-screen attention
- **Continuous**: Seamless wrap-around from last to first item

## Code Pattern: React + Reactive Values

The implementation uses React with what appears to be a reactive value system (possibly Framer Motion or a similar library):
- `rn()` function: Creates reactive values that update based on scroll position
- Derived calculations: Chain reactive values to compute opacity, z-index, etc.
- Declarative style: Maps over items array to generate animated elements

## Browser Compatibility
- **Modern CSS**: Uses `dvh` units (requires recent browser versions)
- **Viewport Units**: Fallback to `96vw` and `96dvh` for maximum constraints
- **Smooth Scrolling**: CSS scroll-behavior (gracefully degrades in older browsers)

## Summary
This is a **scroll-driven vertical carousel** that creates an immersive, full-screen portfolio viewing experience. Each piece of work occupies roughly one viewport height of scroll distance, with smooth opacity transitions and layering effects that make each item feel like it's coming forward or receding as you scroll through the portfolio.

The name of the repository ("keep_scrolling") and the prominent "Keep scrolling" prompt perfectly capture the essence of this interaction pattern - encouraging users to explore the portfolio by scrolling continuously through the work.

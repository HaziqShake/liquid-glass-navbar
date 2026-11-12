// SPDX-License-Identifier: GPL-3.0
//
// One shared backdrop capture per root view, used by every GlassView
// under that root.
//
// WHY THIS EXISTS. Android's RenderEffect.createRuntimeShaderEffect()
// feeds a shader the contents of the RenderNode the effect sits on —
// never the pixels behind the view. An empty view with a RenderEffect
// therefore refracts nothing: its shader input is transparent. That
// is exactly why builds 1-3 showed blur but no refraction at all.
// The only way a glass view can bend the live backdrop is to be GIVEN
// the backdrop as pixels: draw the root hierarchy once into a bitmap,
// then hand each glass view the sub-rectangle it sits over.
//
// COST, AND WHY IT IS CHEAP ENOUGH. The capture is the single most
// expensive thing this module does, so it is shared and throttled:
//  - ONE bitmap per root, not one per glass view. The bar and the
//    droplet read the same bitmap and differ only in which rectangle
//    they sample.
//  - HALF RESOLUTION (scale 2). A 1080x2400 root becomes a 540x1200
//    ARGB_8888 bitmap (~2.6 MB). Half resolution also pre-softens the
//    backdrop, which is what glass wants anyway.
//  - ONCE PER FRAME, at most. captureIfNeeded() is keyed on the root's
//    drawingTime, which is identical for every view drawn in the same
//    frame: the first glass view to reach onPreDraw captures, the rest
//    no-op.
//  - The bitmap is freed when the last glass view under the root
//    unmounts, never left alive for a screen nobody is on.
// The per-view dirty check (a cheap sampled hash) lives in GlassView:
// on a static screen the hash settles and capture + repaint stop
// entirely, so a static screen costs zero capture work.
//
// BUILD 11 — STRIP CAPTURE. The full-root capture was the biggest
// lag source: every frame it software-drew the WHOLE screen
// (~800dp tall) to feed two glass views that together cover ~110dp
// at the bottom. Now the bitmap holds only the STRIP behind the
// glass: the union of the glass views' rectangles (each view
// registers its rect in root pixels via updateRect() on every
// onPreDraw), expanded by STRIP_MARGIN_DP above and below. The
// margin is the refraction's mirror-band reach (iLens * 3 * 0.35
// = ~11.6dp) plus the chain blur radius (3.3dp at the build 10
// default), rounded up to 16dp — the shader can only sample inside
// its own node (samples outside clamp), and the node already spans
// the pill + 24dp outset, so 16dp beyond the view rects is margin
// on top of margin; it exists so a one-frame rect lag (a view that
// moved after the strip was computed) can never leave a glass view
// sampling outside the bitmap. The strip is FULL WIDTH (the bar is
// 90% of the width, so a horizontal crop would save almost nothing
// and would add an x-origin to every mapping) and ~145dp tall
// instead of ~800dp: ~80% fewer pixels drawn and stored per
// capture. The bitmap origin is the strip's top edge in root
// pixels; GlassView subtracts it (bitmapOriginY) when mapping its
// rect into the bitmap, so the bend lands exactly as before — the
// shader still sees the same pixels at the same relative offsets,
// only the bitmap is shorter. The debug readout's `cap` size now
// reads the strip size (e.g. 540x72), which is itself the proof
// the strip capture is live on device.
//
// FEEDBACK LOOP. While a capture is running, `capturing` is true and
// every GlassView short-circuits its draw(), so no glass ever ends up
// inside the backdrop — otherwise the glass would refract itself.

package expo.modules.liquidglassrefraction

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.view.View
import java.util.WeakHashMap
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

internal class SharedBackdrop(private val scale: Int) {

  var bitmap: Bitmap? = null
    private set

  private var canvas: Canvas? = null

  /**
   * The frame this bitmap was captured for. View.getDrawingTime() is
   * stable across every view drawn in the same frame, which is exactly
   * the "capture once per frame" token we need without hooking
   * Choreographer.
   */
  private var capturedFrame = -1L

  /** Live glass views under this root. The bitmap dies with the last one. */
  var refCount = 0

  // ---- BUILD 11: strip capture state ----

  /**
   * The glass views' rectangles in ROOT pixels (full resolution),
   * keyed by the view itself. Each GlassView refreshes its entry
   * in onPreDraw, before triggering the capture, so the strip
   * follows a gliding droplet, a shrinking bar and a held droplet
   * that has grown past the bar. Entries are dropped in
   * onDetachedFromWindow via removeRect().
   */
  private val glassRects = mutableMapOf<Any, Rect>()

  /** Top edge of the captured strip, in root pixels (0 = full root). */
  private var stripTopPx = 0

  /** The strip the current bitmap was captured for. A strip change
   *  forces a recapture even inside the same frame (a second glass
   *  view registering a rect that extends the strip after the first
   *  view already captured). */
  private var capturedStripTopPx = -1
  private var capturedStripHeightPx = -1

  /** Bitmap origin in root pixels: the strip's top edge. GlassView
   *  subtracts this when mapping its rect into the bitmap. 0 while
   *  the capture is still full-root (no rects registered yet). */
  fun bitmapOriginY(): Int = stripTopPx

  fun updateRect(key: Any, rect: Rect) {
    val slot = glassRects[key]
    if (slot == null) {
      glassRects[key] = Rect(rect)
    } else {
      slot.set(rect)
    }
  }

  fun removeRect(key: Any) {
    glassRects.remove(key)
  }

  /**
   * The strip to capture, in root pixels: the union of the
   * registered glass rects, expanded by the margin above and below,
   * clamped to the root. Full width. Falls back to the whole root
   * when no rect has been registered yet (first frame), so the
   * capture can never come back empty.
   */
  private fun stripFor(root: View, density: Float): Rect {
    val marginPx = (STRIP_MARGIN_DP * density).toInt()
    if (glassRects.isEmpty()) {
      return Rect(0, 0, root.width, root.height)
    }
    var top = Int.MAX_VALUE
    var bottom = Int.MIN_VALUE
    for (r in glassRects.values) {
      top = min(top, r.top)
      bottom = max(bottom, r.bottom)
    }
    val h = root.height
    return Rect(0, max(0, top - marginPx), root.width, min(h, bottom + marginPx))
  }

  /**
   * Capture the strip, unless this frame's capture already happened
   * for the CURRENT strip. A strip change recaptures inside the same
   * frame (see capturedStripTopPx above).
   * @return null on success (or a no-op), or the throwable if a view
   * behind the glass refused a software draw.
   */
  fun captureIfNeeded(root: View, frame: Long): Throwable? {
    val density = root.resources.displayMetrics.density
    val strip = stripFor(root, density)
    if (frame == capturedFrame && strip.top == capturedStripTopPx &&
      strip.height() == capturedStripHeightPx
    ) {
      return null
    }

    val w = root.width / scale
    // BUILD 11: the strip height is quantised UP to 16dp buckets,
    // so a shrink/hold animation that moves the strip height by a
    // few dp a frame does not reallocate the bitmap every frame —
    // the bitmap is recreated only when the bucket changes. The
    // bitmap may be a little taller than the strip; the extra rows
    // are never sampled (every view rect sits inside the strip).
    val bucketPx = (STRIP_BUCKET_DP * density).toInt().coerceAtLeast(1)
    val stripHPx = (ceil(strip.height().toDouble() / bucketPx) * bucketPx).toInt()
    val h = stripHPx / scale
    if (w <= 0 || h <= 0) return null

    var bmp = bitmap
    if (bmp == null || bmp.width != w || bmp.height != h) {
      bmp?.recycle()
      bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      bitmap = bmp
      canvas = Canvas(bmp)
    }
    val c = canvas ?: return null

    // Mark the frame before drawing, not after: if the draw throws,
    // no other view under this root should retry the same failing
    // capture in the same frame.
    capturedFrame = frame
    capturedStripTopPx = strip.top
    capturedStripHeightPx = strip.height()
    stripTopPx = strip.top

    bmp.eraseColor(Color.TRANSPARENT)
    c.save()
    val s = 1f / scale
    c.scale(s, s)
    // The bitmap starts at the strip's top edge: shift the root up
    // by exactly that, so strip pixels land at bitmap row 0.
    c.translate(0f, -strip.top.toFloat())
    capturing = true
    return try {
      root.draw(c)
      null
    } catch (t: Throwable) {
      t
    } finally {
      capturing = false
      c.restore()
    }
  }

  /** Drop the held frame so the next captureIfNeeded really captures. */
  fun invalidateFrame() {
    capturedFrame = -1L
    capturedStripTopPx = -1
    capturedStripHeightPx = -1
  }

  private fun dispose() {
    bitmap?.recycle()
    bitmap = null
    canvas = null
    capturedFrame = -1L
    capturedStripTopPx = -1
    capturedStripHeightPx = -1
    stripTopPx = 0
    glassRects.clear()
  }

  companion object {
    /**
     * BUILD 11 — strip margin above and below the union of the
     * glass rects: the refraction mirror band's reach
     * (iLens * 3 * 0.35 = ~11.6dp) plus the chain blur radius
     * (3.3dp at the build 10 default), rounded up to 16dp.
     */
    const val STRIP_MARGIN_DP = 16f

    /** BUILD 11 — strip-height quantisation bucket, in dp. */
    const val STRIP_BUCKET_DP = 16f

    /**
     * True while a shared capture is traversing the hierarchy. Every
     * glass view short-circuits its draw() on this, so none of them
     * end up inside the backdrop.
     */
    @JvmStatic
    @Volatile
    var capturing = false
      private set

    private val byRoot = WeakHashMap<View, SharedBackdrop>()

    @Synchronized
    fun acquire(root: View, scale: Int): SharedBackdrop {
      val existing = byRoot[root]
      val cap = existing ?: SharedBackdrop(scale).also { byRoot[root] = it }
      cap.refCount++
      return cap
    }

    @Synchronized
    fun release(root: View?, cap: SharedBackdrop?) {
      if (cap == null) return
      cap.refCount--
      // Never let an unbalanced release dispose a bitmap other views
      // still hold.
      if (cap.refCount > 0) return
      if (cap.refCount < 0) {
        cap.refCount = 0
        return
      }
      if (root != null) byRoot.remove(root)
      cap.dispose()
    }
  }
}

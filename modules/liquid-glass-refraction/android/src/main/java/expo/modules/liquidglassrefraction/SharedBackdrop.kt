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
// BUILD 13 — SECOND STRIP (bar-included). The droplet samples a
// background-only bitmap, so on hold it could only ever show the
// photo and the re-rendered icon — never the bar. A second strip
// bitmap is captured with the navbar left visible and only the
// droplet subtree (plus the bar's veil View) hidden; the droplet
// samples it ALWAYS now (barMix 1), because the re-rendered
// LensTabIcon is deleted and the bar strip is the only way the
// icons are visible through the droplet at rest too. Captured
// whenever the droplet is shown; at rest it is no longer skipped.
// Both bitmaps are strips with the same origin, so the mapping is
// unchanged.
// BUILD 14 — SYNTHETIC PILL SURFACE. The build 13 strip CANNOT
// contain the bar's live glass by construction (GlassView.draw()
// short-circuits during any capture, and a hardware RenderNode
// cannot draw into the software capture canvas), so the captured
// bar image carried the edge light, icons and labels over the
// UNBENT photo — and three builds in a row the sim called that
// "the navbar visible" while Haziq's phone disagreed. The bar
// bitmap is now BUILT, not just captured: background photo +
// a synthetic pill surface (the photo under the pill region,
// software-blurred to the chain blur radius and tinted at the
// 0.10 mix) + the navbar's non-glass content (icons, labels,
// edge light) drawn over it — see captureBarStripSynthetic.
// The droplet's own rim bend + chain blur apply on top, as
// before. If the synthetic path is unavailable the capture falls
// back to the plain build 13 capture and logs it (readout synth
// N), never a silent claim.
// HONEST LIMIT: the bar's own live glass (its refraction/blurs)
// cannot be in a software capture — a hardware RenderNode cannot
// draw into the software capture canvas, and every glass view
// skips drawing during any capture — so the pill surface is
// synthetic (blurred photo + tint, no live bend), and the
// droplet's own rim bend + chain blur apply on top.
//
// FEEDBACK LOOP. While a capture is running, `capturing` is true and
// every GlassView short-circuits its draw(), so no glass ever ends up
// inside the backdrop — otherwise the glass would refract itself.

package expo.modules.liquidglassrefraction

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.util.Log
import android.view.View
import java.util.WeakHashMap
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal class SharedBackdrop(private val scale: Int) {

  /**
   * BUILD 12 — one strip bitmap and its capture bookkeeping. There
   * are TWO captures now, sharing the same strip (the union of the
   * glass rects + margin):
   *   - bg: the background-only strip (the whole navbar hidden
   *     while capturing). This is the capture every build since 5
   *     has used; the bar and the droplet at rest sample it.
   *   - bar: the bar-included strip. BUILD 14: BUILT, not just
   *     captured — background photo + a synthetic pill surface
   *     (blurred photo + tint under the pill region) + the
   *     navbar's non-glass content drawn over it (see
   *     captureBarStripSynthetic). The droplet samples it ALWAYS
   *     now (barMix 1), at rest as well as on hold — the
   *     re-rendered LensTabIcon is deleted, so this is the only
   *     way the icons are visible through the droplet.
   *     Captured whenever the droplet is shown.
   * Both bitmaps are strips with the same origin, so the
   * bitmapOriginY mapping is the same for both.
   */
  private class StripCapture {
    var bitmap: Bitmap? = null
    var canvas: Canvas? = null
    var capturedFrame = -1L
    var capturedStripTopPx = -1
    var capturedStripHeightPx = -1
    var stripTopPx = 0
  }

  private val bg = StripCapture()
  private val bar = StripCapture()

  val bitmap: Bitmap?
    get() = bg.bitmap

  /** The bar-included strip bitmap (droplet only). BUILD 13: captured
   *  whenever the droplet is shown, so this is non-null once the
   *  droplet has drawn once. */
  val barBitmap: Bitmap?
    get() = bar.bitmap

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

  /** Bitmap origin in root pixels: the strip's top edge. GlassView
   *  subtracts this when mapping its rect into the bitmap. 0 while
   *  the capture is still full-root (no rects registered yet).
   *  BUILD 12: the bar strip shares the bg strip (same stripFor),
   *  so both origins are the same value; barBitmapOriginY() reads
   *  the bar capture's own record for correctness. */
  fun bitmapOriginY(): Int = bg.stripTopPx

  fun barBitmapOriginY(): Int = bar.stripTopPx

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
   * frame (see StripCapture.capturedStripTopPx).
   *
   * The caller hides whatever must stay out of THIS capture before
   * calling and restores it after: the background-only capture hides
   * the whole navbar root; the bar-included capture hides only the
   * droplet subtree. The capture itself just draws the root.
   * @return null on success (or a no-op), or the throwable if a view
   * behind the glass refused a software draw.
   */
  fun captureIfNeeded(root: View, frame: Long): Throwable? {
    return captureStrip(root, frame, bg)
  }

  /**
   * BUILD 13 — the second strip capture: same strip as the
   * background-only capture, but with the navbar left VISIBLE and
   * only the droplet subtree (plus the bar's veil View) hidden
   * (the caller hides them). The droplet samples this bitmap
   * ALWAYS now (barMix 1), so the icons are visible through the
   * droplet at rest as well as on hold — the re-rendered
   * LensTabIcon is deleted. Called whenever the droplet is shown;
   * one extra software draw of the same strip per frame.
   */
  fun captureBarStripIfNeeded(root: View, frame: Long): Throwable? {
    return captureStrip(root, frame, bar)
  }

  private fun captureStrip(root: View, frame: Long, target: StripCapture): Throwable? {
    val density = root.resources.displayMetrics.density
    val strip = stripFor(root, density)
    if (frame == target.capturedFrame && strip.top == target.capturedStripTopPx &&
      strip.height() == target.capturedStripHeightPx
    ) {
      return null
    }
    val c = stripCanvas(target, strip, root, density) ?: return null
    val bmp = target.bitmap ?: return null

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
      // BUILD 14: mark the frame captured ONLY after a successful
      // draw. The old code marked it BEFORE drawing, so a throwing
      // draw left a transparent bitmap marked done and every view
      // reused a blank frame for the rest of the frame. A throwing
      // draw now leaves the frame unmarked, so the next glass view
      // in the same frame retries it (at most once per view).
      // View.getDrawingTime() is stable across every view drawn in
      // the same frame, which is exactly the "capture once per
      // frame" token we need without hooking Choreographer.
      target.capturedFrame = frame
      target.capturedStripTopPx = strip.top
      target.capturedStripHeightPx = strip.height()
      target.stripTopPx = strip.top
      null
    } catch (t: Throwable) {
      t
    } finally {
      capturing = false
      c.restore()
    }
  }

  /**
   * BUILD 11 — strip-height quantisation: the strip height is
   * quantised UP to 16dp buckets, so a shrink/hold animation that
   * moves the strip height by a few dp a frame does not reallocate
   * the bitmap every frame — the bitmap is recreated only when the
   * bucket changes. The bitmap may be a little taller than the
   * strip; the extra rows are never sampled (every view rect sits
   * inside the strip). Allocate (or reuse) the strip bitmap for
   * `target`, sized for `strip`. Returns the bitmap's canvas, or
   * null when the strip has no size.
   */
  private fun stripCanvas(target: StripCapture, strip: Rect, root: View, density: Float): Canvas? {
    val w = root.width / scale
    val bucketPx = (STRIP_BUCKET_DP * density).toInt().coerceAtLeast(1)
    val stripHPx = (ceil(strip.height().toDouble() / bucketPx) * bucketPx).toInt()
    val h = stripHPx / scale
    if (w <= 0 || h <= 0) return null
    var bmp = target.bitmap
    if (bmp == null || bmp.width != w || bmp.height != h) {
      bmp?.recycle()
      bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      target.bitmap = bmp
      target.canvas = Canvas(bmp)
    }
    return target.canvas
  }

  /**
   * BUILD 14 — the bar-included strip WITH A SYNTHETIC PILL
   * SURFACE. Builds the bar bitmap instead of capturing it whole:
   *   1. the background-only strip, copied opaque (the photo
   *      under everything);
   *   2. the synthetic pill: the photo under the pill region,
   *      software-blurred to blurDp and tinted at tintMix,
   *      clipped to the pill's rounded rect (drawSyntheticPill);
   *   3. the navbar's NON-GLASS content drawn over it — the
   *      navbar root subtree (icons, labels, edge light). The
   *      glass views skip their draw while capturing is true, so
   *      the bar glass and the droplet contribute nothing; the
   *      caller hides the droplet frame and the bar's veil View
   *      (both restored in `finally`). The whole root is NOT
   *      drawn here: root.draw would repaint the photo over the
   *      pill and erase step 2.
   * The caller passes the bar rect and the navbar root rect in
   * ROOT pixels (layout rects, from GlassView). The strip, the
   * bitmap size and the origin are the same as the background
   * strip's, so the droplet's mapping is unchanged. One Logcat
   * line per bar capture (success or fallback), so the device
   * check can see which path actually ran.
   * Falls back to the plain build 13 capture (captureStrip with
   * the navbar visible) when there is no usable background strip
   * to build from — and says so, in the log and in
   * lastBarCaptureSynthetic (false), never silently.
   * @return null on success (or a no-op), or the throwable if a
   * draw refused a software draw.
   */
  fun captureBarStripSynthetic(
    root: View,
    frame: Long,
    navbarRoot: View,
    dropletFrame: View,
    barVeil: View?,
    barRectPx: Rect,
    navRectPx: Rect,
    tintRgb: FloatArray,
    tintMix: Float,
    blurDp: Float,
  ): Throwable? {
    val density = root.resources.displayMetrics.density
    val strip = stripFor(root, density)
    if (frame == bar.capturedFrame && strip.top == bar.capturedStripTopPx &&
      strip.height() == bar.capturedStripHeightPx
    ) {
      return null
    }
    val bgBmp = bg.bitmap
    val c = stripCanvas(bar, strip, root, density)
    val barBmp = bar.bitmap
    if (bgBmp == null || bgBmp.isRecycled || c == null || barBmp == null ||
      bgBmp.width != barBmp.width || bgBmp.height != barBmp.height
    ) {
      // No background strip to build from (first frame, or the
      // strip changed size between the two captures): the plain
      // build 13 capture — photo + icons, no pill surface.
      lastBarCaptureSynthetic = false
      Log.w(TAG, "bar capture: no usable bg strip, plain capture (no synthetic pill)")
      val frameWasVisible = dropletFrame.visibility
      val veilWasVisible = barVeil?.visibility
      return try {
        dropletFrame.visibility = View.INVISIBLE
        if (barVeil != null) barVeil.visibility = View.INVISIBLE
        captureStrip(root, frame, bar)
      } finally {
        dropletFrame.visibility = frameWasVisible
        if (barVeil != null && veilWasVisible != null) barVeil.visibility = veilWasVisible
      }
    }
    val frameWasVisible = dropletFrame.visibility
    val veilWasVisible = barVeil?.visibility
    dropletFrame.visibility = View.INVISIBLE
    if (barVeil != null) barVeil.visibility = View.INVISIBLE
    capturing = true
    return try {
      // 1. The background strip, opaque — the photo under everything.
      barBmp.eraseColor(Color.TRANSPARENT)
      c.drawBitmap(bgBmp, 0f, 0f, null)
      // 2. The synthetic pill: blurred photo + tint, clipped to the pill.
      drawSyntheticPill(c, bgBmp, barRectPx, strip.top, tintRgb, tintMix, blurDp, density)
      // 3. The navbar's non-glass content over it. The canvas is
      // scaled to bitmap px and translated by the navbar root's own
      // position in the root, so the icons land exactly where the
      // live bar draws them. (A point p in navbar-local coords maps
      // to ((p.x + navLeft) / scale, (p.y + navTop - stripTop) /
      // scale) — the root point, shifted to the strip origin, at
      // half resolution.)
      c.save()
      val s = 1f / scale
      c.scale(s, s)
      c.translate(navRectPx.left.toFloat(), (navRectPx.top - strip.top).toFloat())
      navbarRoot.draw(c)
      c.restore()
      // Mark captured ONLY after a successful draw (build 14 — see captureStrip).
      bar.capturedFrame = frame
      bar.capturedStripTopPx = strip.top
      bar.capturedStripHeightPx = strip.height()
      bar.stripTopPx = strip.top
      lastBarCaptureSynthetic = true
      Log.d(TAG, "bar capture: synthetic pill drawn, strip ${strip.width()}x${strip.height()} bar ${barBmp.width}x${barBmp.height} pill ${barRectPx.width()}x${barRectPx.height()} root px")
      null
    } catch (t: Throwable) {
      lastBarCaptureSynthetic = false
      t
    } finally {
      capturing = false
      dropletFrame.visibility = frameWasVisible
      if (barVeil != null && veilWasVisible != null) barVeil.visibility = veilWasVisible
    }
  }

  /**
   * BUILD 14 — draw the synthetic pill surface into the bar strip
   * canvas (bitmap px): the photo under the pill region, blurred
   * to blurDp, tinted at tintMix, clipped to the pill's rounded
   * rect. The blur is a downscale-upscale (bilinear): the pill
   * region is drawn into a 1/4-size bitmap and back, which softens
   * detail by ~blurDp without RenderScript or a hardware-only
   * RenderEffect. With blurDp < 1 there is nothing to soften — the
   * region is already the raw photo from step 1 — so only the tint
   * is drawn. The tint is the tint colour at alpha tintMix over the
   * photo, which is exactly mix(photo, tint, tintMix) for the
   * opaque photo.
   */
  private fun drawSyntheticPill(
    canvas: Canvas,
    bgBmp: Bitmap,
    barRectPx: Rect,
    stripTopPx: Int,
    tintRgb: FloatArray,
    tintMix: Float,
    blurDp: Float,
    density: Float,
  ) {
    val s = scale.toFloat()
    val left = barRectPx.left / s
    val top = (barRectPx.top - stripTopPx) / s
    val right = barRectPx.right / s
    val bottom = (barRectPx.bottom - stripTopPx) / s
    if (right <= left || bottom <= top) return
    val radius = (bottom - top) / 2f
    val pillRect = RectF(left, top, right, bottom)
    val filterPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    val blurPx = blurDp * density / s
    if (blurPx >= 1f) {
      // Blurred photo: downscale the pill region (+margin, so the
      // downscale edge never shows at the rim) to 1/4, then draw it
      // back up, clipped to the pill.
      val margin = (blurPx * 2f).toInt() + 4
      val srcL = max(0, left.toInt() - margin)
      val srcT = max(0, top.toInt() - margin)
      val srcR = min(bgBmp.width, ceil(right).toInt() + margin)
      val srcB = min(bgBmp.height, ceil(bottom).toInt() + margin)
      if (srcR > srcL && srcB > srcT) {
        val factor = 4
        val smallW = max(1, (srcR - srcL) / factor)
        val smallH = max(1, (srcB - srcT) / factor)
        val small = Bitmap.createBitmap(smallW, smallH, Bitmap.Config.ARGB_8888)
        val sc = Canvas(small)
        sc.drawBitmap(
          bgBmp, Rect(srcL, srcT, srcR, srcB),
          RectF(0f, 0f, smallW.toFloat(), smallH.toFloat()), filterPaint,
        )
        val path = Path()
        path.addRoundRect(pillRect, radius, radius, Path.Direction.CW)
        canvas.save()
        canvas.clipPath(path)
        canvas.drawBitmap(
          small, null,
          RectF(srcL.toFloat(), srcT.toFloat(), srcR.toFloat(), srcB.toFloat()),
          filterPaint,
        )
        canvas.restore()
        small.recycle()
      }
    }
    // Tint: mix the tint colour in at tintMix.
    if (tintMix > 0f) {
      val tintPaint = Paint().apply {
        color = Color.argb(
          (tintMix * 255f).roundToInt().coerceIn(0, 255),
          (tintRgb[0] * 255f).roundToInt().coerceIn(0, 255),
          (tintRgb[1] * 255f).roundToInt().coerceIn(0, 255),
          (tintRgb[2] * 255f).roundToInt().coerceIn(0, 255),
        )
        style = Paint.Style.FILL
      }
      canvas.drawRoundRect(pillRect, radius, radius, tintPaint)
    }
  }

  /** Drop the held frames so the next capture really captures. */
  fun invalidateFrame() {
    for (target in listOf(bg, bar)) {
      target.capturedFrame = -1L
      target.capturedStripTopPx = -1
      target.capturedStripHeightPx = -1
    }
  }

  private fun dispose() {
    for (target in listOf(bg, bar)) {
      target.bitmap?.recycle()
      target.bitmap = null
      target.canvas = null
      target.capturedFrame = -1L
      target.capturedStripTopPx = -1
      target.capturedStripHeightPx = -1
      target.stripTopPx = 0
    }
    glassRects.clear()
  }

  companion object {
    private const val TAG = "SharedBackdrop"

    /**
     * BUILD 14: true when the last bar capture actually drew the
     * synthetic pill surface (false after a plain fallback or a
     * failed capture). Read by GlassView for the debug readout —
     * the proof the pill is really in the bar strip.
     */
    @Volatile
    var lastBarCaptureSynthetic = false

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

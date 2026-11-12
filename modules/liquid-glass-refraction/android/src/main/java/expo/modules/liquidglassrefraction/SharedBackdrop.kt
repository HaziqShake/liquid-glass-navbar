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
// FEEDBACK LOOP. While a capture is running, `capturing` is true and
// every GlassView short-circuits its draw(), so no glass ever ends up
// inside the backdrop — otherwise the glass would refract itself.

package expo.modules.liquidglassrefraction

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import java.util.WeakHashMap

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

  /**
   * Capture the root, unless this frame's capture already happened.
   * @return null on success (or a no-op), or the throwable if a view
   * behind the glass refused a software draw.
   */
  fun captureIfNeeded(root: View, frame: Long): Throwable? {
    if (frame == capturedFrame) return null

    val w = root.width / scale
    val h = root.height / scale
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

    bmp.eraseColor(Color.TRANSPARENT)
    c.save()
    val s = 1f / scale
    c.scale(s, s)
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
  }

  private fun dispose() {
    bitmap?.recycle()
    bitmap = null
    canvas = null
    capturedFrame = -1L
  }

  companion object {
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

// SPDX-License-Identifier: GPL-3.0
//
// Hardware liquid-glass view for the navbar demo. Rewritten from
// scratch, 12 Nov 2026 (build 4).
//
// THE MECHANISM — READ THIS BEFORE TOUCHING ANYTHING. Builds 1-3 put
// a RenderEffect on an EMPTY view and expected its AGSL shader to
// sample the backdrop behind the view. That can never work: Android's
// RenderEffect.createRuntimeShaderEffect(shader, name) binds `name`
// to the contents of the RenderNode the effect is installed on — the
// view's OWN drawing, never the pixels behind it. An empty view's
// shader input is transparent, so builds 1-3 showed blur (expo-blur,
// a different path) but no refraction, ever, at any size.
//
// This view does it the way that actually works (the mechanism
// react-native-liquid-glassmorphism uses, re-implemented here in
// minimal form for this one navbar):
//   1. onPreDraw: the shared holder draws the root view ONCE per
//      frame into one half-resolution bitmap (SharedBackdrop), with
//      every glass view skipped so there is no feedback loop.
//   2. onDraw: this view records a hardware RenderNode that draws
//      the captured bitmap cropped to this view's rectangle, sets a
//      RenderEffect on THAT node — a blur chain into the AGSL
//      material shader for the bar, the material shader alone for
//      the droplet — and draws the node. The shader's `backdrop`
//      uniform is the node's recorded content, i.e. REAL backdrop
//      pixels, so the bend is real.
//   3. A cheap sampled hash of this view's rectangle in the bitmap:
//      if the backdrop under this view did not change since the last
//      capture, no recapture and no re-invalidation happen, so a
//      static screen costs zero capture work. When the list scrolls
//      or the droplet moves, the hash differs and one fresh frame
//      is captured and painted.
//
// BUILD 9 (12 Nov 2026). Haziq tested build 8 on his own phone:
// edge lighting PERFECT, veil PERFECT (do not touch either). The
// refraction was "too rainbow and does not bend anything". This
// build ports the DISPLACEMENT MODEL of react-native-liquid-
// glassmorphism — the library the Pioneer Gym live app used before
// its glass navbar was scrapped (27 Oct 2026) — into the one
// unified glass shader below, and rebuilds the droplet from
// scratch. What changed, and why:
//
//   - DISPLACEMENT (the fix). Builds 6-8 displaced all channels
//     together by up to 56dp over a narrow ~24dp exp band, with a
//     +/-4dp per-channel fringe on top. Two careful device checks
//     saw ZERO coherent displacement at the rim while the sim
//     measured up to 46dp — and a faint rainbow fringe WAS visible
//     at the bottom edge. That combination (fringe visible,
//     coherent jump invisible) is exactly what a bend of ~0 with a
//     surviving +/-4dp split looks like. The code comparison
//     against the library found NO defect in the capture /
//     RenderNode / coordinate plumbing — it matches the library
//     line for line (same shared half-res capture, same srcRect
//     math, same RenderNode record + setRenderEffect +
//     drawRenderNode, same units: resolution in view px, iLens and
//     every displacement term in px via density) — and the droplet
//     proves the same path renders a working lens on device. So
//     the suspect was never the plumbing; it was the shader's own
//     displacement model and effect arrangement, which matched the
//     proven library in NOTHING. Build 9 therefore adopts the
//     library's configuration wholesale instead of tuning the old
//     model blindly:
//       * rim = 1 - clamp(-d / lensW, 0, 1), lensW =
//         max(28px, iCorner * 1.4) — a wide LINEAR band (~45dp on
//         our 64dp bar), 0 in the interior, 1 at the edge.
//       * bend = rim * rim * axisFade, where axisFade =
//         smoothstep(0.15, 0.8, conf) eases the lens off toward
//         the medial axis (conf from a WIDE-epsilon central
//         difference of the SDF, as the library does) so the top
//         and bottom rings do not collide into a seam.
//       * disp = n2 * bend * iLens * edgeGuard, ONE coherent
//         displacement along the surface normal for ALL channels.
//         iLens = 14.85dp * thickness = ~11dp at thickness 0.75
//         (GlassParams.lensStrengthPx: base 11dp for clear, x1.35
//         with refraction on). edgeGuard = smoothstep(0,
//         max(12, reflW * 0.18), -d) tapers refraction to zero at
//         the outermost pixels.
//       * reflDisp = n2 * reflMask * (iLens * 3.0 * iRefl) *
//         edgeGuard, reflMask = edgeBand * edgeBand * axisFade,
//         iRefl = 0.35 (edgeReflectionStrength) — a broad, soft
//         mirror band, not a thin streak.
//       * NO chromatic split at all (ca = 0). The library's own
//         ca is n2 * bend * iLens * 0.018 (~0.2dp, invisible) and
//         the gym ran iridescence=0. The Anivio per-channel split
//         (red 16dp / green 62dp / blue 57dp) is DELETED — that
//         split is the rainbow Haziq sees, and because it
//         displaces channels differently with no coherent
//         component, it can never bend anything.
//       * Chain order SWAPPED BACK to the library's:
//         createChainEffect(material, blur) = material(blur(
//         source)) — the blur runs FIRST and the material shader
//         samples the LIGHTLY-FROSTED backdrop, exactly as the
//         library's shader comment requires ("`content` is a
//         LIGHTLY-frosted backdrop (kept crisp enough to
//         refract)"). Build 6 swapped this to material-first on
//         a theoretical argument that was never validated on
//         device in isolation; the material-first order is the
//         ONE structural difference between our bar path and the
//         library's working path (the droplet, which works on
//         device, has no blur at all), so it goes. Blur stays
//         3dp, tintMix 0.10, veil 0.02 — clarity untouched.
//       * Samples are CLAMPED to the node bounds, as the library
//         does (ours never clamped).
//     The old 56dp model, the exp rim band, the tangent spread
//     and the +/-4dp fringe are all deleted, not tuned.
//   - The sheen / highlight lighting terms are UNCHANGED in shape
//     (narrow exp rim, top-weighted): they are part of the rim
//     look Haziq confirmed perfect, so they keep their own rim
//     mask and do not follow the new wide displacement rim.
//   - DROPLET, REBUILT FROM SCRATCH (standing rule). One unified
//     shader for both modes now: at REST the droplet is the same
//     glass as the bar (same refraction + blur, magnification
//     1.0 — NO magnification at all). ONLY ON HOLD it magnifies,
//     and the magnification is UNIFORM: one scale factor about
//     the droplet centre (magBase = centre + (coord - centre) /
//     mag, applied BEFORE the edge displacement, as the library
//     does for its constant magnification) — a plain zoomed-in
//     image, no fisheye, no per-channel split. Holding also
//     drops the blur to 0 while keeping the refraction. The
//     library's radial touch-magnifier warp is NOT used (radial
//     warp, not uniform zoom). The hold state arrives as a plain
//     `held` boolean prop; the native side eases magnification
//     1 -> M and blur 3dp -> 0 over ~200ms itself, so no animated
//     props ever touch this native view.
//   - DEBUG READOUT, per mode. The old readout reported one
//     `drawn` flag for the LAST mode drawn, so the bar's own
//     effect-drawn status was never separately proven (the
//     readout always said "(droplet)"). Now the bar and the
//     droplet report separately: "drawn bar Y drop Y". If the
//     bar's effect path ever fails on device while the
//     droplet's works, the readout says so directly.
//
// PERFORMANCE RULES (all deliberate, do not "optimise" them away):
//   - ONE shared bitmap per root per frame; bar and droplet share
//     it, never one capture each.
//   - Capture at scale 2 (half resolution).
//   - Capture only in onPreDraw, only while the view is shown.
//   - The bitmap is freed when the last glass view unmounts.
//   - The shader runs only over the pill areas (this view's rect),
//     never fullscreen.
//   - No expo-blur in the bar path: the RenderEffect chain does the
//     blur (bar only) and the refraction in one GPU pass.
//
// MODES. One class, ONE shader, chosen by the `mode` prop:
//   - "bar": the capsule glass with the library-port refraction,
//     tintMix 0.10, rim sheen, and the blur-first chain.
//   - "droplet": the SAME glass, over a slot-width capsule. At
//     rest magnification is 1.0 (no zoom, same glass as the bar);
//     on hold it zooms uniformly about its centre and its blur
//     drops to 0. The droplet's shape and z-order live in
//     LiquidNavbar.tsx; this file only renders the glass.
// FALLBACK (API < 33, no RuntimeShader): the bar draws a plain
// tinted pill with Canvas; the droplet draws nothing rather than a
// fake white circle. Never a crash.

package expo.modules.liquidglassrefraction

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import expo.modules.kotlin.AppContext

/**
 * Build-6 verification aid. The last native glass state, written by
 * GlassView on every capture/draw and read by the module's
 * getGlassDebug async function so the DemoScreen can print it on
 * screen. This is what settles, from the outside, whether the
 * navbar root was really found and hidden during capture and
 * whether the effect really drew. REMOVE before final delivery.
 *
 * BUILD 9: the effect-drawn flag is per mode. The old single flag
 * reported the LAST mode drawn, so the bar's own effect-drawn
 * status was never separately proven (the readout always ended
 * "(droplet)"). Now "drawn bar Y drop N" says exactly which
 * glass actually drew through the effect path.
 */
internal object GlassDebugState {
  @Volatile var bitmapSize = "—"
  @Volatile var navbarFound = false
  @Volatile var navbarHidden = false
  @Volatile var effectDrawnBar = false
  @Volatile var effectDrawnDroplet = false
  @Volatile var lastHash = "—"
  @Volatile var lastRect = "—"
  @Volatile var lastMode = "—"

  fun snapshot(): String {
    val nav = if (navbarFound) "Y" else "N"
    val hid = if (navbarHidden) "Y" else "N"
    val bar = if (effectDrawnBar) "Y" else "N"
    val drop = if (effectDrawnDroplet) "Y" else "N"
    return "cap $bitmapSize | nav $nav hid $hid | drawn bar $bar drop $drop ($lastMode)\n" +
      "hash $lastHash | rect $lastRect"
  }
}

@SuppressLint("ViewConstructor")
class GlassView(context: Context, appContext: AppContext) : View(context),
  ViewTreeObserver.OnPreDrawListener {

  companion object {
    private const val TAG = "GlassView"

    // The shader samples 24dp beyond the pill on every side, so the
    // consumer must lay this view out 24dp larger than the pill on
    // every side (pill + 48dp, at left/top -24dp) inside an
    // overflow-hidden container that clips it to the pill shape.
    const val OUTSET_DP = 24f

    /** Half-resolution shared capture. */
    const val CAPTURE_SCALE = 2

    const val DEFAULT_MODE = "bar"
    const val DEFAULT_GLOW_STRENGTH = 1.0f
    // Build 8 DIAGNOSTIC, kept in build 9: multiplies the coherent
    // displacement (iLens * bend * bendScale). Default 1.0 = the
    // shipped look. The JS settings' bendDiagnostic switch sets it
    // to 3.0 to prove whether ANY displacement reaches the screen.
    // Never the shipped look by default; see GLASS_SHADER_SOURCE.
    const val DEFAULT_BEND_SCALE = 1.0f
    // Build 7: tint 0.10, not 0.15 — the bar must read CLEAR, not frosted.
    const val DEFAULT_TINT_MIX = 0.10f
    // Dark tint (28,28,30), the iOS 27 default fill colour.
    val DEFAULT_TINT_COLOR = floatArrayOf(28f / 255f, 28f / 255f, 30f / 255f)
    // BUILD 9: the droplet's HOLD magnification M (uniform zoom
    // about the droplet centre). At rest the droplet renders at
    // magnification 1.0 — NO magnification at all, same glass as
    // the bar. Only while held does it zoom to M. Default 1.35
    // (the old rim-magnification default, kept as the hold zoom).
    const val DEFAULT_MAGNIFICATION = 1.35f
    /** Blur radius in dp at the default Blur setting (50/100). Build 7: 3dp, not 6dp — the 6dp
     *  post-material blur smeared the whole pill milky on device (build 6 verdict). Build 9
     *  keeps 3dp but moves the blur back in FRONT of the material (the library's order):
     *  the shader samples the lightly-frosted backdrop, as the library's shader requires.
     *  The droplet uses this as its REST blur and animates it to 0 while held. */
    const val DEFAULT_BLUR_RADIUS_DP = 3f
    /**
     * BUILD 9 — the library-port lens strength, in dp.
     * GlassParams.lensStrengthPx: base 11dp for `clear`, x1.35 with
     * refraction on = 14.85dp; times the gym navbar's thickness
     * 0.75 = ~11.1dp. (Note: the library's `refraction` prop
     * defaults to false, so the gym bar as configured actually ran
     * 11dp x 0.75 = 8.25dp; the 14.85dp figure is the brief's
     * prescribed value and is used here. Either way the bend is
     * ~8-11dp at the rim — subtle, wide-band, and coherent — not
     * the old 56dp narrow-band jump.)
     */
    const val LENS_DP = 14.85f * 0.75f
    /** Edge-reflection band strength, the gym navbar's
     *  edgeReflectionStrength (0.35). Scales ONLY the mirror band. */
    const val REFL_STRENGTH = 0.35f
    /** How long the droplet's hold animation takes, in ms:
     *  magnification 1 -> M and blur 3dp -> 0, eased. */
    const val HOLD_ANIM_MS = 200L
  }

  private var mode: String = DEFAULT_MODE
  private var glowStrength: Float = DEFAULT_GLOW_STRENGTH
  // Build 8 DIAGNOSTIC: multiplies the coherent displacement.
  // Default 1.0 (shipped look); 3.0 only from the bendDiagnostic
  // setting, to prove on device whether ANY displacement reaches
  // the screen. Droplet mode ignores it (always 1.0).
  private var bendScale: Float = DEFAULT_BEND_SCALE
  private var tintMix: Float = DEFAULT_TINT_MIX
  private var tintColor: FloatArray = DEFAULT_TINT_COLOR.copyOf()
  // BUILD 9: the droplet's HOLD magnification M. At rest the
  // droplet renders at 1.0 (no zoom); while held it zooms to M,
  // uniformly about its centre. The bar ignores this (always 1.0).
  private var magnification: Float = DEFAULT_MAGNIFICATION
  private var blurRadiusDp: Float = DEFAULT_BLUR_RADIUS_DP
  // BUILD 9: the droplet's hold state, as a plain boolean prop
  // from JS. The native side eases heldAnim 0 -> 1 over
  // HOLD_ANIM_MS itself (see onDraw), so no animated props ever
  // touch this native view: magnification goes 1 -> M and the
  // droplet blur goes blurRadiusDp -> 0. The bar ignores this.
  private var heldTarget = 0f
  private var heldAnim = 0f
  private var heldAnimFrom = 0f
  private var heldAnimStart = 0L

  // Compiled for the current mode only. RuntimeShader (AGSL) needs
  // API 33+. Null below API 33, or if compilation ever fails — the
  // view then falls back to the Canvas tint and never crashes.
  // BUILD 9: one unified shader source for both modes; the modes
  // differ only in uniforms (magnification, blur, bendScale).
  private var shader: RuntimeShader? = null

  // Hardware node the captured bitmap is recorded into. The
  // RenderEffect lives on THIS node, never on the view itself: the
  // node's recorded content (the bitmap) is what the shader samples.
  private val effectNode: RenderNode? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) RenderNode("GlassView") else null

  private var shared: SharedBackdrop? = null
  private var lastHash = 0
  private var haveGoodCapture = false
  private var effectDrawnLogged = false
  private var shaderErrorLogged = false
  // Build 5: the backdrop no longer contains the navbar, so a moving
  // droplet changes no pixel in the bitmap and the hash alone would
  // never repaint it. The view's own rectangle is part of the dirty
  // check: a moved/resized view repaints even on a static backdrop.
  private val curRect = Rect()
  private val lastRect = Rect()
  private var lastRectValid = false
  private var lastHiddenNavbar: View? = null
  private var lastHiddenSize = ""
  private var navbarMissingLogged = false

  private val fallbackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val srcRect = Rect()
  private val dstRect = Rect()
  private val hashRect = Rect()
  private val locThis = IntArray(2)
  private val locRoot = IntArray(2)

  init {
    // A plain View defaults to willNotDraw=true, which would skip
    // onDraw entirely. This view's whole job is onDraw.
    setWillNotDraw(false)
    setBackgroundColor(Color.TRANSPARENT)
  }

  fun setMode(value: String) {
    val next = if (value == "droplet") "droplet" else "bar"
    if (mode == next) return
    mode = next
    shader = null
    effectDrawnLogged = false
    invalidate()
  }

  fun setGlowStrength(value: Float) {
    if (glowStrength == value) return
    glowStrength = value
    invalidate()
  }

  // Build 8 DIAGNOSTIC. Multiplies the coherent displacement.
  // Default 1.0 (shipped look); 3.0 only when the bendDiagnostic
  // setting is ON, so the device check can see whether ANY bend
  // reaches the screen.
  fun setBendScale(value: Float) {
    if (bendScale == value) return
    bendScale = value
    invalidate()
  }

  fun setTintMix(value: Float) {
    if (tintMix == value) return
    tintMix = value
    invalidate()
  }

  fun setTintColor(r: Float, g: Float, b: Float) {
    if (tintColor[0] == r && tintColor[1] == g && tintColor[2] == b) return
    tintColor = floatArrayOf(r, g, b)
    invalidate()
  }

  // BUILD 9: the droplet's HOLD magnification M (uniform zoom
  // about the droplet centre). At rest the droplet renders at
  // 1.0 — this value only applies while held. The bar ignores it.
  fun setMagnification(value: Float) {
    if (magnification == value) return
    magnification = value
    invalidate()
  }

  fun setBlurRadius(valueDp: Float) {
    if (blurRadiusDp == valueDp) return
    blurRadiusDp = valueDp
    invalidate()
  }

  // BUILD 9: the droplet's hold state. A plain boolean prop from
  // JS (set via runOnJS from the gesture worklets, mirroring the
  // lift SharedValue). The native side eases heldAnim 0 -> 1 over
  // HOLD_ANIM_MS in onDraw: magnification 1 -> M, droplet blur
  // blurRadiusDp -> 0. The bar ignores this entirely.
  fun setHeld(value: Boolean) {
    val target = if (value) 1f else 0f
    if (heldTarget == target) return
    heldTarget = target
    heldAnimFrom = heldAnim
    heldAnimStart = SystemClock.uptimeMillis()
    postInvalidateOnAnimation()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(this)
    val root = rootView
    if (root != null && shared == null) {
      shared = SharedBackdrop.acquire(root, CAPTURE_SCALE)
      Log.d(TAG, "onAttachedToWindow: mode=$mode size=${width}x${height}")
    }
  }

  override fun onDetachedFromWindow() {
    val observer = viewTreeObserver
    if (observer.isAlive) observer.removeOnPreDrawListener(this)
    SharedBackdrop.release(rootView, shared)
    shared = null
    haveGoodCapture = false
    super.onDetachedFromWindow()
  }

  // ---- Backdrop capture (once per frame, before drawing) ----

  override fun onPreDraw(): Boolean {
    if (SharedBackdrop.capturing || width <= 0 || height <= 0) return true
    // A paused or off-screen view keeps its last frame and stops
    // doing the one expensive thing here: a full software
    // root.draw() into the shared bitmap.
    if (!isShown) return true
    val root = rootView ?: return true
    val cap = shared ?: return true
    // BUILD 5 — HIDE THE WHOLE NAVBAR WHILE CAPTURING. Build 4's
    // capture drew the entire root, so the bitmap contained the
    // bar's own veil (dark, drawn ON TOP of the glass), the white
    // icons, the edge light and the labels — then the bar shader
    // blurred that dark, icon-filled image and tinted it again.
    // That is why the bar read as a dark frosted pill with no
    // visible bend, and why the droplet was a pale disc: the lens
    // magnified the big white icon, not the background. The navbar
    // root is set INVISIBLE (never GONE, so no layout runs) for the
    // duration of the capture only, inside onPreDraw, before the
    // frame is drawn to the screen, and restored in `finally` —
    // so the screen never shows it missing and there is no flicker.
    // GlassView.draw() already skips glass views during a capture;
    // this hides everything else the navbar draws.
    val navbarRoot = findNavbarRoot(root)
    if (navbarRoot != null) {
      val size = "${navbarRoot.width}x${navbarRoot.height}"
      if (navbarRoot !== lastHiddenNavbar || size != lastHiddenSize) {
        lastHiddenNavbar = navbarRoot
        lastHiddenSize = size
        Log.d(TAG, "capture: hiding navbar root ${navbarRoot.javaClass.simpleName} $size")
      }
    } else if (!navbarMissingLogged) {
      navbarMissingLogged = true
      Log.w(TAG, "capture: navbar root NOT FOUND, capture will include the navbar (build 4 behaviour)")
    }
    val wasVisible = navbarRoot?.visibility
    val failure = try {
      if (navbarRoot != null) navbarRoot.visibility = View.INVISIBLE
      cap.captureIfNeeded(root, root.drawingTime)
    } finally {
      if (navbarRoot != null && wasVisible != null) navbarRoot.visibility = wasVisible
    }
    if (failure != null) {
      Log.w(TAG, "backdrop capture failed (${failure.javaClass.simpleName}); reusing last frame")
    }
    // Only repaint when the backdrop under THIS view actually
    // changed, or when THIS view moved/resized. Comparing a cheap
    // sampled hash breaks the old self-sustaining 60fps capture ->
    // invalidate loop: on a static screen the hash settles and we
    // stop; when content behind scrolls, onPreDraw fires from THAT
    // invalidation, the hash differs, and one fresh frame is
    // painted. The rectangle check is build 5: with the navbar out
    // of the bitmap, a moving droplet changes no bitmap pixel, so
    // the hash alone would leave it painting a stale rectangle.
    var rectChanged = false
    val bmp = shared?.bitmap
    if (bmp != null && viewRectInBitmap(bmp, curRect)) {
      rectChanged = !lastRectValid || curRect != lastRect
      if (rectChanged) {
        lastRect.set(curRect)
        lastRectValid = true
      }
    }
    val hash = backdropHash()
    // Build 6 debug: publish the native state so the on-screen
    // readout can show it. navbarHidden is true only when a root
    // was actually found AND set INVISIBLE for this capture; if
    // findNavbarRoot ever fails, this reads nav N hid N and the
    // Appetize check settles it instead of guessing.
    val bmpNow = shared?.bitmap
    GlassDebugState.bitmapSize =
      if (bmpNow != null) "${bmpNow.width}x${bmpNow.height}" else "—"
    GlassDebugState.navbarFound = navbarRoot != null
    GlassDebugState.navbarHidden = navbarRoot != null
    GlassDebugState.lastHash = "%08x".format(hash)
    GlassDebugState.lastRect =
      "${curRect.left},${curRect.top},${curRect.right},${curRect.bottom}"
    GlassDebugState.lastMode = mode
    if (!haveGoodCapture || hash != lastHash || rectChanged) {
      lastHash = hash
      haveGoodCapture = true
      // Schedule the repaint OUTSIDE this draw pass. invalidate()
      // issued from within onPreDraw is unreliably coalesced by
      // HWUI; postInvalidateOnAnimation() reliably lands on the
      // next frame.
      postInvalidateOnAnimation()
    }
    return true
  }

  /**
   * BUILD 5: find the navbar root — the ancestor of this view that
   * is a direct child of the DemoScreen root — so the capture can
   * hide the WHOLE navbar. The screen root is the first ancestor
   * going up that is (a) at least half the root's size in both
   * dimensions and (b) has more than one child: every wrapper
   * above the screen (GestureHandlerRootView, ReactRootView, the
   * content FrameLayout) is full-screen but single-child, and
   * every multi-child view below the screen root (the bar itself)
   * is far smaller than half the screen. The navbar root is the
   * child of that screen root on this view's ancestor chain.
   *
   * NOTE: the literal "climb while parent.parent != rootView" walk
   * would be WRONG here. rootView is the DecorView, several
   * single-child wrappers above the screen root, so that walk
   * would climb to the ReactRootView and hide the whole app.
   * This size + child-count test finds the screen root instead,
   * whatever wrappers sit above it.
   */
  private fun findNavbarRoot(root: View): View? {
    var child: View = this
    var node = parent as? View
    while (node != null && node != root) {
      if (node is ViewGroup && node.childCount > 1 &&
        node.width >= root.width / 2 && node.height >= root.height / 2
      ) {
        return child
      }
      child = node
      node = node.parent as? View
    }
    return null
  }

  /**
   * A cheap sampled hash of THIS view's rectangle of the shared
   * backdrop. Deliberately not a hash of the whole bitmap: that
   * would repaint every glass view whenever anything anywhere
   * moved, throwing away the per-view dirty detection.
   */
  private fun backdropHash(): Int {
    val bmp = shared?.bitmap ?: return 0
    if (!viewRectInBitmap(bmp, hashRect)) return 0
    var hash = 1
    val cols = 6
    val rows = 5
    for (r in 0 until rows) {
      val y = hashRect.top + if (rows == 1) 0 else (hashRect.height() - 1) * r / (rows - 1)
      for (c in 0 until cols) {
        val x = hashRect.left + if (cols == 1) 0 else (hashRect.width() - 1) * c / (cols - 1)
        hash = hash * 31 + bmp.getPixel(
          x.coerceIn(0, bmp.width - 1),
          y.coerceIn(0, bmp.height - 1),
        )
      }
    }
    return hash
  }

  /**
   * This view's rectangle inside the shared, root-sized backdrop
   * bitmap (bitmap coordinates are root pixels / CAPTURE_SCALE).
   */
  private fun viewRectInBitmap(bmp: Bitmap, out: Rect): Boolean {
    val root = rootView ?: return false
    getLocationInWindow(locThis)
    root.getLocationInWindow(locRoot)
    val left = (locThis[0] - locRoot[0]) / CAPTURE_SCALE
    val top = (locThis[1] - locRoot[1]) / CAPTURE_SCALE
    val right = left + width / CAPTURE_SCALE
    val bottom = top + height / CAPTURE_SCALE
    if (right <= 0 || bottom <= 0 || left >= bmp.width || top >= bmp.height) return false
    out.set(
      left.coerceIn(0, bmp.width),
      top.coerceIn(0, bmp.height),
      right.coerceIn(0, bmp.width),
      bottom.coerceIn(0, bmp.height),
    )
    return out.width() > 0 && out.height() > 0
  }

  override fun draw(canvas: Canvas) {
    // Skipped for ANY shared capture, not just one this view
    // triggered. The bitmap is shared, so it must contain no glass
    // at all — otherwise the glass refracts itself.
    if (SharedBackdrop.capturing) return
    super.draw(canvas)
  }

  // ---- Glass rendering ----

  override fun onDraw(canvas: Canvas) {
    val w = width
    val h = height
    if (w <= 0 || h <= 0) return
    // A software canvas is a capture pass (or software rendering):
    // never paint glass into it, or the glass would land in the
    // backdrop bitmap.
    if (!canvas.isHardwareAccelerated) return

    // BUILD 9: ease the droplet's hold animation toward its
    // target (magnification 1 -> M, blur 3dp -> 0) over
    // HOLD_ANIM_MS, and keep invalidating until it settles. The
    // bar never animates this (heldTarget stays 0 for it).
    if (heldAnim != heldTarget) {
      val now = SystemClock.uptimeMillis()
      val t = ((now - heldAnimStart).toFloat() / HOLD_ANIM_MS).coerceIn(0f, 1f)
      // Ease-out cubic: fast off the mark, gentle landing — the
      // same feel as the lift transform's 180ms ease.
      val eased = 1f - (1f - t) * (1f - t) * (1f - t)
      heldAnim = heldAnimFrom + (heldTarget - heldAnimFrom) * eased
      if (t < 1f) {
        postInvalidateOnAnimation()
      } else {
        heldAnim = heldTarget
      }
    }

    val bmp = shared?.bitmap
    val node = effectNode
    val shader = shaderForMode()
    if (bmp != null && !bmp.isRecycled && node != null && shader != null) {
      node.setPosition(0, 0, w, h)
      val rec = node.beginRecording()
      if (!viewRectInBitmap(bmp, srcRect)) srcRect.set(0, 0, bmp.width, bmp.height)
      dstRect.set(0, 0, w, h)
      rec.drawBitmap(bmp, srcRect, dstRect, null)
      node.endRecording()
      node.setRenderEffect(buildEffect(shader, w, h))
      canvas.drawRenderNode(node)
      // Build 9 debug: the effect really drew, PER MODE. The old
      // single flag reported the last mode drawn, so the bar's own
      // status was never separately proven.
      if (mode == "droplet") {
        GlassDebugState.effectDrawnDroplet = true
      } else {
        GlassDebugState.effectDrawnBar = true
      }
      GlassDebugState.lastMode = mode
      if (!effectDrawnLogged) {
        effectDrawnLogged = true
        Log.d(TAG, "GlassView: EFFECT DRAWN mode=$mode size=${w}x$h")
      }
      return
    }

    // Fallback (API < 33, or no capture yet): the bar draws a plain
    // tinted pill so it never renders invisible; the droplet draws
    // NOTHING rather than a fake white circle — a clear lens cannot
    // be faked with a tint.
    if (mode == "bar") {
      fallbackPaint.color = Color.argb(
        90,
        (tintColor[0] * 255).toInt().coerceIn(0, 255),
        (tintColor[1] * 255).toInt().coerceIn(0, 255),
        (tintColor[2] * 255).toInt().coerceIn(0, 255),
      )
      val radius = h / 2f
      canvas.drawRoundRect(0f, 0f, w.toFloat(), h.toFloat(), radius, radius, fallbackPaint)
    }
  }

  private fun shaderForMode(): RuntimeShader? {
    shader?.let { return it }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
    return try {
      // BUILD 9: ONE unified shader for both modes. The bar and
      // the droplet are the same glass; the modes differ only in
      // uniforms (magnification, blur, bendScale) and in the
      // droplet's hold animation.
      RuntimeShader(GLASS_SHADER_SOURCE).also { shader = it }
    } catch (t: Throwable) {
      if (!shaderErrorLogged) {
        shaderErrorLogged = true
        Log.w(TAG, "AGSL shader failed to compile (${t.javaClass.simpleName}); using tint fallback", t)
      }
      null
    }
  }

  /**
   * BUILD 9 — the library's effect order: BLUR FIRST, material
   * SECOND (createChainEffect(material, blur) =
   * material(blur(source))). The material shader samples the
   * LIGHTLY-FROSTED backdrop, exactly as the library's shader
   * requires. Build 6's material-first order (createChainEffect
   * (blur, material)) was a theoretical swap that was never
   * validated on device in isolation, and it is the one structural
   * difference between our bar path and the library's working
   * path — so it goes. The droplet at rest gets the same blur as
   * the bar; while held its blur animates to 0 (material only).
   */
  private fun buildEffect(shader: RuntimeShader, w: Int, h: Int): RenderEffect? {
    val density = resources.displayMetrics.density
    shader.setFloatUniform("resolution", w.toFloat(), h.toFloat())
    shader.setFloatUniform("density", density)
    shader.setFloatUniform("outset", OUTSET_DP * density)
    shader.setFloatUniform("glowStrength", glowStrength)
    // Build 8 DIAGNOSTIC, kept: the bar's coherent displacement
    // scales by bendScale (1.0 shipped, 3.0 diagnostic). The
    // droplet always runs at 1.0.
    shader.setFloatUniform("bendScale", if (mode == "droplet") 1f else bendScale)
    shader.setFloatUniform("tintMix", tintMix)
    shader.setFloatUniform("tintColor", tintColor[0], tintColor[1], tintColor[2])
    // BUILD 9: the library-port lens strength, in px.
    shader.setFloatUniform("iLens", LENS_DP * density)
    // BUILD 9: uniform centre magnification. The bar never zooms
    // (1.0). The droplet is 1.0 at rest — NO magnification at all,
    // same glass as the bar — and eases to M while held.
    val mag = if (mode == "droplet") 1f + (magnification - 1f) * heldAnim else 1f
    shader.setFloatUniform("magnification", mag)
    return try {
      val material = RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
      // Effective blur: the bar always blurs; the droplet blurs
      // at rest and animates to 0 while held (refraction stays).
      val blurDp = if (mode == "droplet") blurRadiusDp * (1f - heldAnim) else blurRadiusDp
      val blurPx = (blurDp * density).coerceAtLeast(0f)
      if (blurPx <= 0f) return material
      val blur = RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
      // Outer = material, inner = blur: material(blur(source)).
      RenderEffect.createChainEffect(material, blur)
    } catch (t: Throwable) {
      Log.w(TAG, "RenderEffect failed (${t.javaClass.simpleName}); drawing un-blurred", t)
      null
    }
  }
}

// BUILD 9 — ONE unified glass shader for the bar and the droplet,
// porting the displacement model of react-native-liquid-
// glassmorphism (the library the Pioneer Gym live app used before
// its glass navbar was scrapped on 27 Oct 2026; the gym navbar ran
// variant="clear", thickness=0.75, blurRadius=3, iridescence=0,
// edgeReflectionStrength=0.35, legibilityFloor=0.4, interactive).
// The library's AGSL is GLASS_AGSL in LiquidGlassmorphismView.kt;
// the prop-to-number mapping is GlassParams.kt in the same
// directory. The port, term by term:
//
//   - lensW = max(28px, iCorner * 1.4); reflW = max(14px,
//     minDim * 0.35). rim = 1 - clamp(-d / lensW, 0, 1), 0 in the
//     interior, 1 at the edge. (iCorner here is the capsule
//     radius, in px; minDim is the smaller half-extent, so
//     min(b.x, b.y) * 0.7 in the library's half-size terms.)
//   - bend = rim * rim * axisFade, where axisFade =
//     smoothstep(0.15, 0.8, conf) eases the lens off toward the
//     medial axis so the top and bottom rings do not collide into
//     a seam. conf comes from a WIDE-epsilon central difference
//     of the SDF (e = clamp(lensW * 0.3, 1, 16)px), as the
//     library does — a 1px epsilon makes conf a 1px notch, which
//     turns the fade into the very seam it exists to prevent.
//     The normal DIRECTION itself is the exact analytic capsule
//     normal (identical to the SDF gradient away from the axis);
//     only conf needs the sampled gradient.
//   - disp = n2 * bend * iLens * edgeGuard, ONE coherent
//     displacement along the surface normal for ALL channels.
//     iLens = 14.85dp * thickness = ~11dp at thickness 0.75.
//     edgeGuard = smoothstep(0, max(12, reflW * 0.18), -d)
//     tapers refraction to zero at the outermost pixels.
//   - reflDisp = n2 * reflMask * (iLens * 3.0 * iRefl) *
//     edgeGuard, reflMask = edgeBand * edgeBand * axisFade,
//     iRefl = 0.35. Broad and soft, not a thin streak.
//   - Chromatic dispersion: DELETED ENTIRELY (ca = 0). The
//     library's ca is n2 * bend * iLens * 0.018 (~0.2dp,
//     essentially invisible) and the gym ran iridescence=0.
//     The Anivio per-channel split (red 16dp / green 62dp /
//     blue 57dp) is gone — that split IS the rainbow Haziq sees,
//     and because it displaces channels differently with no
//     coherent component, it can never bend anything. One sample,
//     all channels, clamped to the node bounds as the library does.
//   - Uniform centre magnification (droplet hold zoom only):
//     magBase = centre + (coord - centre) / magnification,
//     applied BEFORE the edge displacement, so the lens still
//     bends whatever the magnified surface is showing. One scale
//     factor about the centre: a plain zoomed-in image, no
//     fisheye, no per-channel split. The library's radial
//     touch-magnifier warp (magCoord) is NOT used — it is a
//     radial warp, not a uniform zoom. magnification = 1.0 is a
//     no-op (bar always, droplet at rest).
//   - Blur stays 3dp, tintMix 0.10, veil 0.02 (do not touch).
//     The library's clear-variant numbers (frost floor 0,
//     adaptive lift 0.03, tint ~4.7% white) agree with our
//     clarity; nothing is re-tuned.
//   - The sheen / highlight lighting terms are UNCHANGED in
//     shape (narrow exp rim, top-weighted): they are part of the
//     rim look Haziq confirmed perfect on build 8, so they keep
//     their own rim mask and do not follow the new wide
//     displacement rim. Only the DISPLACEMENT was criticised;
//     only the displacement changes.
//   - `bendScale` is the build 8 DIAGNOSTIC multiplier (default
//     1.0; 3.0 only when the bendDiagnostic setting is ON). It
//     scales the coherent displacement AND the mirror band, so
//     the device check can see whether ANY refraction reaches
//     the screen. If 3x shows nothing, the displacement path is
//     dead on device; if 3x shows, 1.0 is below visibility.
//     Never the shipped look.
//
// `backdrop` here is the captured bitmap drawn into the RenderNode:
// real backdrop pixels. It is NOT the view's own (empty) drawing —
// that was the builds 1-3 mistake.
private const val GLASS_SHADER_SOURCE = """
uniform shader backdrop;
uniform float2 resolution;
uniform float density;
uniform float outset;
uniform float glowStrength;
// BUILD 8 DIAGNOSTIC: multiplies the coherent displacement and
// the mirror band (iLens * bend * bendScale). Default 1.0 = the
// shipped look. 3.0 only when the bendDiagnostic setting is ON,
// to prove on device whether ANY displacement reaches the screen.
// If 3x shows nothing, the displacement path is dead on device;
// if 3x shows, 1.0 is below visibility. Never the shipped look.
uniform float bendScale;
uniform float tintMix;
uniform half3 tintColor;
// BUILD 9: the library-port lens strength, in px
// (14.85dp * thickness 0.75 = ~11dp, times density).
uniform float iLens;
// BUILD 9: uniform centre magnification. 1.0 = no zoom (the bar
// always, the droplet at rest). While the droplet is held this
// eases to M: one scale factor about the droplet centre, a plain
// zoomed-in image, no fisheye. Applied BEFORE the edge
// displacement, so the lens still bends the magnified surface.
uniform float magnification;

float sdCapsule(float2 p, float2 halfSize, float radius) {
    float2 q = float2(max(abs(p.x) - halfSize.x + radius, 0.0), p.y);
    return length(q) - radius;
}

half4 main(float2 position) {
    float2 b = resolution * 0.5;
    float2 local = position - b;
    float2 halfSize = b - outset;
    float radius = halfSize.y;
    float d = sdCapsule(local, halfSize, radius);
    float coverage = 1.0 - smoothstep(-0.5, 0.5, d);
    if (coverage <= 0.0) return half4(0.0);

    // Analytic surface normal (exact for a distance field, away
    // from the medial axis): the capsule vector, normalised.
    float2 capQ = float2(max(abs(local.x) - halfSize.x + radius, 0.0), local.y);
    float distC = length(capQ);
    float2 n2 = float2(capQ.x * sign(local.x), capQ.y) / max(distC, 0.001);

    // Library-port displacement bands. lensW is the wide linear
    // rim band (~45dp on our 64dp bar); reflW the broad mirror
    // band. rim is 0 in the interior, 1 at the edge — the centre
    // stays nearly undistorted, the bend happens at the edges
    // and corners, exactly as the iPhone Control Center reference
    // shows.
    float lensW = max(28.0, radius * 1.4);
    float reflW = max(14.0, min(halfSize.x, halfSize.y) * 0.7);
    float rim = 1.0 - clamp(-d / lensW, 0.0, 1.0);
    float edgeBand = 1.0 - clamp(-d / reflW, 0.0, 1.0);

    // Medial-axis confidence, library method: the SDF gradient
    // collapses along the shape's medial axis (the ridge
    // equidistant from two edges), where the top and bottom lens
    // rings meet and the normal flips. Sampled over a WIDE
    // epsilon (the scale of the lens ring), conf varies smoothly
    // across the ridge instead of stepping 1 -> 0 -> 1 within
    // two pixels, so axisFade eases the lens off toward the
    // ridge instead of cutting a hard seam across the middle
    // of the pill.
    float e = clamp(lensW * 0.3, 1.0, 16.0);
    float gx = sdCapsule(local + float2(e, 0.0), halfSize, radius)
             - sdCapsule(local - float2(e, 0.0), halfSize, radius);
    float gy = sdCapsule(local + float2(0.0, e), halfSize, radius)
             - sdCapsule(local - float2(0.0, e), halfSize, radius);
    float conf = length(float2(gx, gy)) / (2.0 * e);
    float axisFade = smoothstep(0.15, 0.8, conf);

    // Lens profile: almost all the refraction happens in the
    // outer ring — the centre stays clear. bend is a steep power
    // of rim, so the displacement is strongest at the very edge.
    float bend = rim * rim * axisFade;
    // Edge guard: taper ALL refraction to zero across the
    // outermost few px, where the displacement peaks and would
    // otherwise magnify residual normal noise into radial
    // hairlines. The lens band just inside is untouched.
    float edgeGuard = smoothstep(0.0, max(12.0, reflW * 0.18), -d);
    // Edge reflection: a lens band at the rim that folds the
    // sample back on itself, so content near the edge appears
    // mirrored — the inverted echo iOS shows at the top and
    // bottom of a glass pill. Broad and soft (the outer third
    // of the surface each side), not a thin streak.
    float reflMask = edgeBand * edgeBand * axisFade;
    // The refraction-strength setting gates BOTH bands (0 = no
    // bend at all, as in builds 6-8); the uniform zoom below is
    // independent of it.
    float bendGate = glowStrength <= 0.0 ? 0.0 : 1.0;
    float2 reflDisp = n2 * reflMask * (iLens * 3.0 * 0.35) * edgeGuard * bendScale * bendGate;
    // Refraction: ONE coherent displacement along the surface
    // normal for ALL channels. iLens is the edge displacement
    // in px (~11dp).
    float2 disp = n2 * bend * iLens * edgeGuard * bendScale * bendGate;

    // Uniform centre magnification (droplet hold zoom only).
    // magnification == 1.0 is a no-op: the sample is the pixel
    // itself. Above 1.0 the sample is pulled toward the centre
    // by ONE factor everywhere — a plain zoom, no fisheye.
    float2 magBase = magnification == 1.0 ? position : b + (position - b) / magnification;
    float2 uv = magBase - disp - reflDisp;
    // NO chromatic split (ca = 0): one coherent sample for all
    // channels, clamped to the node bounds as the library does.
    // The Anivio per-channel split (16/62/57dp) that made the
    // rainbow is deleted.
    half3 refracted = backdrop.eval(clamp(uv, float2(0.0), resolution - 1.0)).rgb;

    // The rim band's base colour IS the bent sample, mixed in by
    // `bend` — builds 4-5 kept the undisplaced sample as the
    // base and let the bend only tint the sheen, so nothing ever
    // moved. The interior (bend 0) keeps the base sample. BOTH
    // samples start from magBase, not from the raw position: the
    // uniform hold zoom must apply to the WHOLE lens content,
    // not only to the rim band — sampling the base at `position`
    // would leave the interior unzoomed (bend ~ 0 there) and the
    // hold magnification would vanish exactly where the icon
    // sits. With magnification 1.0 (the bar always, the droplet
    // at rest) magBase IS the position, so this changes nothing
    // there.
    half3 surface = mix(backdrop.eval(magBase).rgb, tintColor, tintMix);
    half3 displacedSurface = mix(refracted, tintColor, tintMix);
    surface = mix(surface, displacedSurface, bend);

    // Vibrancy — glass over-saturates what it transmits.
    half luminance = dot(refracted, half3(0.2126, 0.7152, 0.0722));
    half3 vib = clamp(mix(half3(luminance), refracted, 1.25), 0.0, 1.0);

    // Sheen + highlight — UNCHANGED from builds 6-8 (narrow exp
    // rim, top-weighted). Part of the rim look Haziq confirmed
    // perfect; kept on its own rim mask, not the new wide band.
    float depth = max(-d, 0.0) / density;
    float sheenRim = exp(-0.0565 * depth - 0.0322 * depth * depth);
    float upperLight = 0.18 + 0.82 * pow(max(-n2.y, 0.0), 0.65);
    half3 sheen = half3(0.1735, 0.0529, 0.0184) + vib * half3(0.0953, 0.3152, 0.3822);
    half3 color = surface + sheen * sheenRim * upperLight * glowStrength;
    float highlight = exp(-pow((depth - 0.35) / 0.42, 2.0));
    float highlightLight = 0.12 + 0.88 * sqrt(max((1.0 - n2.y) * 0.5, 0.0));
    color += half3(0.25) * highlight * highlightLight * glowStrength;
    return half4(clamp(color, 0.0, 1.0) * coverage, coverage);
}
"""

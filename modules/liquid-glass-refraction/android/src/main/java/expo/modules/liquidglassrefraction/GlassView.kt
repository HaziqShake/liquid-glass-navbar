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
//     image, no fisheye, no per-channel split. BUILD 13: holding
//     drops the blur to 0 again (Haziq reversed the build 9
//     verdict) and the magnification is 1.0 (the frame scale does
//     the magnifying now); the droplet's bend runs at 0.12x so the
//     icons stay clean. The library's radial touch-magnifier warp
//     is NOT used (radial warp, not uniform zoom). The hold state
//     arrives as a plain `held` boolean prop; the native side
//     eases the blur 3.3dp -> 0 over ~200ms itself, so no animated
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
//   - BUILD 11: capture only the STRIP behind the glass (the union
//     of the glass rects + 16dp margin), never the full root — the
//     full-root capture was the biggest lag source.
//   - BUILD 13: the second strip is captured WHENEVER the droplet
//     is shown, not only while held — the re-rendered LensTabIcon
//     is deleted, so the bar strip is the only way the icons are
//     visible through the droplet at rest too. The bar's veil View
//     is hidden during that capture (findBarVeil), so no veil is
//     baked in: the droplet carries its own veil, which fades to 0
//     on hold. The droplet's bend runs at DROPLET_BEND_SCALE
//     (0.12) so the icons stay clean, and its blur eases to 0 on
//     hold. The bar is untouched.
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
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
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
  @Volatile var barBitmapSize = "—"
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
    return "cap $bitmapSize barcap $barBitmapSize | nav $nav hid $hid | drawn bar $bar drop $drop ($lastMode)\n" +
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
    // BUILD 10 default 0.5 (was 1.0): Haziq's exact new default.
    // NOTE: glowStrength scales the rim sheen/highlight and gates
    // the bend on/off; the bend magnitude itself is NOT scaled by
    // it, so the refraction bend is unchanged at 0.5.
    const val DEFAULT_GLOW_STRENGTH = 0.5f
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
    // BUILD 13: the JS default is 1.0 — the frame scale does the
    // magnifying now (uniform scale transform, s = 1.25) — so this
    // native default only applies if JS never passes the prop.
    const val DEFAULT_MAGNIFICATION = 1.35f
    /** Blur radius in dp at the default Blur setting (55/100).
     *  BUILD 10: 3.3dp (was 3dp at Blur 50). The JS mapping is
     *  barBlur * 0.06, so 55 -> 3.3dp. BUILD 13: the droplet's
     *  blur DOES animate to 0 while held again (build 10 kept it
     *  on hold; Haziq reversed that verdict on 13 Nov — on hold
     *  the droplet is a clear magnifying lens, no blur and no
     *  veil). buildEffect computes the droplet's effective blur
     *  as blurRadiusDp * (1 - heldAnim); the BAR keeps
     *  blurRadiusDp at all times (its heldTarget stays 0). */
    const val DEFAULT_BLUR_RADIUS_DP = 3.3f
    /** BUILD 13 — the droplet's bend scale. The droplet bends its
     *  content with the same library-port model as the bar, but at
     *  0.12x strength: at bend 1.0 the icon's top edge displaces
     *  4.9dp (expanded bar) and 8.4dp (shrunk bar) — the icon
     *  stretches visibly — while 0.12x keeps the worst-case icon
     *  edge at ~1.0dp rendered and the rim still bends ~1.4-1.7dp,
     *  so the droplet still reads as glass (its edge light and
     *  sheen are untouched). The BAR is untouched (bendScale 1.0
     *  shipped — its refraction was confirmed right in build 9).
     *  Applied through the bendScale uniform for droplet mode
     *  only; it scales both the coherent displacement and the
     *  mirror band. */
    const val DROPLET_BEND_SCALE = 0.12f
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
    /** How long the droplet's hold animation takes, in ms.
     *  BUILD 13: the blur fade 3.3dp -> 0 (the magnification is
     *  1.0 now — the frame scale does the magnifying — so the ease
     *  is the blur fade, eased-out cubic, same feel as before). */
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
  // touch this native view. BUILD 13: heldAnim drives the
  // droplet's blur 3.3dp -> 0 (and the bar-mix, which is now 1
  // whenever the bar strip exists — the droplet always samples
  // the bar-included strip). The bar ignores this.
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
  // BUILD 12: logged once if the droplet frame cannot be found for
  // the bar-included capture (the droplet then falls back to the
  // background-only bitmap — the old behaviour, never a crash).
  private var dropletFrameMissingLogged = false

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
  // HOLD_ANIM_MS in onDraw. BUILD 13: heldAnim drives the
  // droplet's blur to 0 while held (Haziq reversed the build 9
  // verdict — on hold the droplet is a clear magnifying lens, no
  // blur and no veil). The bar ignores this entirely.
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
    // BUILD 11: drop this view's rect from the strip union, so a
    // stale rect can never keep the strip tall after unmount.
    shared?.removeRect(this)
    SharedBackdrop.release(rootView, shared)
    shared = null
    haveGoodCapture = false
    super.onDetachedFromWindow()
  }

  // ---- Backdrop capture (once per frame, before drawing) ----

  override fun onPreDraw(): Boolean {
    if (SharedBackdrop.capturing || width <= 0 || height <= 0) return true
    // A paused or off-screen view keeps its last frame and stops
    // doing the one expensive thing here: a software draw of the
    // backdrop strip into the shared bitmap.
    if (!isShown) return true
    val root = rootView ?: return true
    val cap = shared ?: return true
    // BUILD 11 — STRIP CAPTURE: register this view's rectangle in
    // root pixels before triggering the capture, so the strip is
    // the union of the glass rects (bar + droplet) and follows a
    // gliding droplet, a shrinking bar and a held droplet that has
    // grown past the bar. The capture itself reads the union.
    if (viewRectInRoot(curRect)) {
      cap.updateRect(this, curRect)
    }
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
    // BUILD 13 — BAR-INCLUDED CAPTURE (droplet only, ALWAYS).
    // Build 12 captured this strip only while held, because the
    // droplet sampled the background-only bitmap at rest and the
    // icon it covered was re-rendered above the glass (LensTabIcon).
    // Build 13 deletes the re-rendered icon entirely — the icons
    // stay BELOW the droplet and are seen only through the glass —
    // so the droplet must sample the bar-included strip at REST
    // too, or the active tab's icon would be invisible under it.
    // This second strip capture leaves the navbar VISIBLE and hides
    // only the droplet subtree (the frame found by
    // findDropletFrame) AND the bar's veil View (found by
    // findBarVeil): the bar's 0.50 veil must NOT be baked into the
    // bitmap, or the held droplet could never be veil-free — the
    // droplet carries its own veil View on top, which fades to 0
    // on hold. Both views are restored in `finally`. One extra
    // software draw of the same small strip per frame; the strip
    // is ~145dp tall at half resolution, and the dirty-check hash
    // below still gates repaints on a static screen.
    // HONEST LIMIT: the bar's own live glass is NOT in this bitmap
    // — a hardware RenderNode cannot draw into the software capture
    // canvas, and every glass view skips drawing during any capture
    // — so it carries the veil, edge light, icons and labels over
    // the UNBENT photo, and the droplet's own rim bend + chain blur
    // apply on top of that.
    if (mode == "droplet") {
      val dropletFrame = findDropletFrame()
      if (dropletFrame != null) {
        val barVeil = findBarVeil()
        val frameWasVisible = dropletFrame.visibility
        val veilWasVisible = barVeil?.visibility
        val barFailure = try {
          dropletFrame.visibility = View.INVISIBLE
          if (barVeil != null) barVeil.visibility = View.INVISIBLE
          cap.captureBarStripIfNeeded(root, root.drawingTime)
        } finally {
          dropletFrame.visibility = frameWasVisible
          if (barVeil != null && veilWasVisible != null) {
            barVeil.visibility = veilWasVisible
          }
        }
        if (barFailure != null) {
          Log.w(TAG, "bar capture failed (${barFailure.javaClass.simpleName}); reusing last frame")
        }
      } else if (!dropletFrameMissingLogged) {
        dropletFrameMissingLogged = true
        Log.w(TAG, "bar capture: droplet frame NOT FOUND, droplet falls back to the background-only bitmap")
      }
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
    // BUILD 13: the droplet always samples the bar-included
    // bitmap (not only while held), so its hash joins the dirty
    // check unconditionally — a bar change (veil, icons, shrink)
    // that leaves the background-only bitmap untouched must still
    // repaint the droplet.
    var hash = backdropHash()
    if (mode == "droplet") {
      hash = hash * 31 + backdropHash(shared?.barBitmap, shared?.barBitmapOriginY() ?: 0)
    }
    // Build 6 debug: publish the native state so the on-screen
    // readout can show it. navbarHidden is true only when a root
    // was actually found AND set INVISIBLE for this capture; if
    // findNavbarRoot ever fails, this reads nav N hid N and the
    // Appetize check settles it instead of guessing.
    val bmpNow = shared?.bitmap
    GlassDebugState.bitmapSize =
      if (bmpNow != null) "${bmpNow.width}x${bmpNow.height}" else "—"
    val barBmpNow = shared?.barBitmap
    GlassDebugState.barBitmapSize =
      if (barBmpNow != null) "${barBmpNow.width}x${barBmpNow.height}" else "—"
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
   * BUILD 12: find the droplet frame — the ancestor of this (droplet)
   * view that holds the glass wrapper — so the bar-included capture
   * can hide the droplet subtree while leaving the navbar visible.
   * Identified by SIZE, not by level-counting: this view is
   * absoluteFill inside its wrapper, so the wrapper is exactly this
   * view's size and the frame is exactly this view's size minus
   * 48dp (OUTSET_DP on every side). The first ancestor whose size
   * matches (width - 48dp, height - 48dp) within 2px IS the frame:
   * the wrapper is 48dp bigger, the overlay is bar-sized, and
   * nothing else in the chain has that size. Re-walked on every
   * held frame (a handful of ancestors); if the tree ever changes
   * shape the walk simply finds nothing and the droplet falls back
   * to the background-only bitmap.
   */
  private fun findDropletFrame(): View? {
    val density = resources.displayMetrics.density
    val frameW = width - (OUTSET_DP * 2f * density)
    val frameH = height - (OUTSET_DP * 2f * density)
    var node = parent as? View
    while (node != null) {
      if (kotlin.math.abs(node.width - frameW) <= 2f &&
        kotlin.math.abs(node.height - frameH) <= 2f
      ) {
        return node
      }
      node = node.parent as? View
    }
    return null
  }

  /**
   * BUILD 13: find the bar's veil View — the plain leaf View that
   * darkens the bar glass (LiquidNavbar.tsx styles.veil, opacity
   * legibilityVeil 0.50, inside the bar's glassContainer) — so the
   * bar-included capture can hide it while leaving the navbar
   * visible. The bar's veil must NOT be baked into the bitmap: the
   * droplet carries its own veil View on top (which fades to 0 on
   * hold), and a baked-in 0.50 veil would make a veil-free held
   * droplet impossible.
   *
   * Identified by SIZE + LEAF, not by level-counting: from the
   * droplet frame (findDropletFrame) climb two levels — the
   * overlay, then the bar — and depth-first search the bar's
   * subtree for a LEAF view (no children) whose size matches the
   * bar's within 2px. The veil is the only such view: the
   * glassContainer, the droplet overlay and the icon row are all
   * bar-sized but have children; the edge-light Svg is bar-sized
   * but has children; the tab slots are slot-wide; the droplet's
   * own veil is frame-sized. If the tree ever changes shape the
   * walk simply finds nothing and the capture keeps the old
   * behaviour (veil baked in) — never a crash.
   */
  private var barVeilMissingLogged = false

  private fun findBarVeil(): View? {
    val frame = findDropletFrame() ?: return null
    val bar = (frame.parent as? ViewGroup)?.parent as? View ?: return null
    val barW = bar.width
    val barH = bar.height
    val stack = mutableListOf<View>(bar)
    while (stack.isNotEmpty()) {
      val v = stack.removeAt(stack.size - 1)
      if (v !== bar) {
        val isLeaf = v !is ViewGroup || v.childCount == 0
        if (isLeaf &&
          kotlin.math.abs(v.width - barW) <= 2f &&
          kotlin.math.abs(v.height - barH) <= 2f
        ) {
          return v
        }
      }
      if (v is ViewGroup) {
        for (i in 0 until v.childCount) stack.add(v.getChildAt(i))
      }
    }
    if (!barVeilMissingLogged) {
      barVeilMissingLogged = true
      Log.w(TAG, "bar capture: bar veil NOT FOUND, the held droplet will keep the baked-in veil")
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
    return backdropHash(shared?.bitmap, shared?.bitmapOriginY() ?: 0)
  }

  /**
   * BUILD 12: the same sampled hash over a given bitmap (the bar-
   * included strip while held). The origin is that bitmap's own
   * strip top — same value as the bg strip's in practice, read
   * separately for correctness.
   */
  private fun backdropHash(bmp: Bitmap?, originY: Int): Int {
    if (bmp == null) return 0
    if (!viewRectInBitmap(bmp, hashRect, originY)) return 0
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
   * This view's rectangle in ROOT pixels (full resolution), for the
   * BUILD 11 strip union. False when the root is gone.
   */
  private fun viewRectInRoot(out: Rect): Boolean {
    val root = rootView ?: return false
    getLocationInWindow(locThis)
    root.getLocationInWindow(locRoot)
    val left = locThis[0] - locRoot[0]
    val top = locThis[1] - locRoot[1]
    out.set(left, top, left + width, top + height)
    return true
  }

  /**
   * This view's rectangle inside the shared backdrop bitmap
   * (bitmap coordinates are root pixels / CAPTURE_SCALE).
   * BUILD 11: the bitmap holds only the STRIP behind the glass,
   * whose origin is the strip's top edge in root pixels — subtract
   * it (bitmapOriginY), so the rect lands on the same pixels it
   * would have in a full-root bitmap and the bend is unchanged.
   */
  private fun viewRectInBitmap(bmp: Bitmap, out: Rect, originY: Int? = null): Boolean {
    val root = rootView ?: return false
    getLocationInWindow(locThis)
    root.getLocationInWindow(locRoot)
    // BUILD 12: the origin is the bitmap's own strip top — the bg
    // strip's by default, the bar strip's when the caller passes it.
    val origin = originY ?: (shared?.bitmapOriginY() ?: 0)
    val left = (locThis[0] - locRoot[0]) / CAPTURE_SCALE
    val top = (locThis[1] - locRoot[1] - origin) / CAPTURE_SCALE
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
    // target over HOLD_ANIM_MS, and keep invalidating until it
    // settles. BUILD 13: heldAnim drives the droplet's blur
    // 3.3dp -> 0 (buildEffect) — the magnification is 1.0 now
    // (the frame scale does the magnifying), so the ease is the
    // blur fade. The bar never animates this (heldTarget stays 0
    // for it).
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
      // BUILD 13: WHICH STRIP THE NODE HOLDS. Only the node's
      // recorded content gets the chain blur — a BitmapShader input
      // is sampled raw. The droplet ALWAYS samples the bar strip
      // now (it shows the bar's icons/labels through the glass at
      // rest too — the re-rendered LensTabIcon is deleted), so
      // whenever the bar strip exists the node holds it and the
      // bar image is chain-blurred exactly like the background is
      // for the bar; barMix is 1 (see buildEffect). Build 12
      // switched the node to the bar strip only past the midpoint
      // of the hold ramp (heldAnim >= 0.5) because the droplet
      // sampled the background strip at rest — that switch, and
      // its mid-blend blur step, are gone. If the bar strip is
      // missing (first frames, or the droplet frame was not
      // found) the node stays on the background strip (the old
      // behaviour, blurred as before) and barMix is forced to 0.
      val barBmp = shared?.barBitmap
      val useBarNode = mode == "droplet" &&
        barBmp != null && !barBmp.isRecycled
      val contentBmp = if (useBarNode) barBmp else bmp
      node.setPosition(0, 0, w, h)
      val rec = node.beginRecording()
      val contentOrigin = if (useBarNode) shared?.barBitmapOriginY() else null
      if (!viewRectInBitmap(contentBmp, srcRect, contentOrigin)) {
        srcRect.set(0, 0, contentBmp.width, contentBmp.height)
      }
      dstRect.set(0, 0, w, h)
      rec.drawBitmap(contentBmp, srcRect, dstRect, null)
      node.endRecording()
      node.setRenderEffect(buildEffect(shader, w, h, srcRect, useBarNode))
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
   * path — so it goes. BUILD 13: the droplet's blur DOES drop to
   * 0 on hold (Haziq reversed the build 9 verdict — on hold the
   * droplet is a clear magnifying lens); the bar keeps its blur.
   */
  /**
   * BUILD 13 — the droplet's bar-included backdrop. `srcRect` is
   * this view's rectangle inside the shared strip bitmap (already
   * computed by onDraw); the bar bitmap shares the strip, so the
   * same rect maps it. The droplet ALWAYS samples the bar strip
   * now (barMix 1 whenever the node holds it): the re-rendered
   * LensTabIcon is deleted, so the bar image is the ONLY way the
   * icons are visible through the droplet — at rest as well as on
   * hold. `useBarNode` (see onDraw) says the node holds the BAR
   * strip: then `backdrop` is the blurred bar image and the input
   * shader is the background strip; otherwise `backdrop` is the
   * blurred background and the input is the bar strip. nodeIsBar
   * tells the shader which side of the mix each input is on, so
   * the mix is always background -> bar. The bar bitmap is passed
   * as a BitmapShader input with a local matrix mapping node
   * coords to bitmap coords: the node records drawBitmap(bmp,
   * srcRect, dstRect(0,0,w,h)), so bitmapX = srcRect.left +
   * nodeX / CAPTURE_SCALE. If no bar bitmap exists yet (first
   * held frames, or the droplet frame was not found) barMix is
   * forced to 0 and the bg bitmap stands in as the input, so the
   * shader never samples an unset uniform and the droplet falls
   * back to the background-only bitmap, blurred, as before.
   */
  private fun buildEffect(
    shader: RuntimeShader,
    w: Int,
    h: Int,
    srcRect: Rect,
    useBarNode: Boolean,
  ): RenderEffect? {
    val density = resources.displayMetrics.density
    shader.setFloatUniform("resolution", w.toFloat(), h.toFloat())
    shader.setFloatUniform("density", density)
    shader.setFloatUniform("outset", OUTSET_DP * density)
    shader.setFloatUniform("glowStrength", glowStrength)
    // Build 8 DIAGNOSTIC, kept: the bar's coherent displacement
    // scales by bendScale (1.0 shipped, 3.0 diagnostic). The
    // droplet runs at DROPLET_BEND_SCALE (0.12, build 13): its
    // bend is tamed so the icons seen through it stay clean, while
    // the rim still bends enough to read as glass. The bar is
    // untouched (its refraction was confirmed right in build 9).
    shader.setFloatUniform(
      "bendScale",
      if (mode == "droplet") DROPLET_BEND_SCALE else bendScale,
    )
    shader.setFloatUniform("tintMix", tintMix)
    shader.setFloatUniform("tintColor", tintColor[0], tintColor[1], tintColor[2])
    // BUILD 9: the library-port lens strength, in px.
    shader.setFloatUniform("iLens", LENS_DP * density)
    // BUILD 9: uniform centre magnification. The bar never zooms
    // (1.0). The droplet is 1.0 at rest — NO magnification at all,
    // same glass as the bar — and eases to M while held.
    val mag = if (mode == "droplet") 1f + (magnification - 1f) * heldAnim else 1f
    shader.setFloatUniform("magnification", mag)
    // BUILD 13: the droplet always shows the bar-included strip
    // (barMix 1) whenever the node holds it — the bar image is
    // the only way the icons are visible through the droplet now
    // that the re-rendered LensTabIcon is deleted. The bar always
    // runs at 0. If no bar strip exists yet, barMix is 0 and the
    // droplet falls back to the background-only bitmap.
    val barBmp = if (mode == "droplet") shared?.barBitmap else null
    val barMix = if (useBarNode) 1f else 0f
    shader.setFloatUniform("barMix", barMix)
    shader.setFloatUniform("nodeIsBar", if (useBarNode) 1f else 0f)
    // The mix partner: the background strip when the node holds the
    // bar strip, else the bar strip (or the background strip when
    // no bar strip exists yet — at rest the mix is 0, so the input
    // is never sampled then).
    val inputBmp = if (useBarNode) shared?.bitmap else (barBmp ?: shared?.bitmap)
    val barInput = BitmapShader(
      inputBmp ?: return null,
      Shader.TileMode.CLAMP,
      Shader.TileMode.CLAMP,
    )
    // Node coords -> bitmap coords: scale by 1/CAPTURE_SCALE,
    // then translate by the srcRect origin. (Matrix.setScale
    // followed by postTranslate gives exactly [1/s, 0, left;
    // 0, 1/s, top].) The input bitmap shares the node's strip, so
    // the same srcRect maps it.
    val barMatrix = Matrix()
    barMatrix.setScale(1f / CAPTURE_SCALE, 1f / CAPTURE_SCALE)
    barMatrix.postTranslate(srcRect.left.toFloat(), srcRect.top.toFloat())
    barInput.setLocalMatrix(barMatrix)
    shader.setInputShader("barBackdrop", barInput)
    return try {
      val material = RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
      // Effective blur: the BAR blurs at blurRadiusDp always.
      // BUILD 13: the DROPLET's blur is hold-driven — blurRadiusDp
      // at rest, easing to 0 as heldAnim -> 1, so the held droplet
      // is a clear magnifying lens (Haziq reversed the build 9
      // verdict that blur stays on hold). No new plumbing: this
      // runs on every onDraw and onDraw already re-invalidates
      // while heldAnim animates, so the blur eases 3.3dp -> 0 over
      // the existing 200ms hold ramp. The bar keeps 3.3dp (its
      // heldTarget stays 0). STRIP_MARGIN_DP (16dp) stays safe: a
      // blur going to 0 only shrinks the needed margin.
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
// BUILD 13: the bar-included backdrop (a second strip capture with
// the navbar visible, only the droplet subtree and the bar's veil
// hidden) and the mix from the background-only backdrop to it.
// The droplet ALWAYS runs at 1.0 now — the re-rendered LensTabIcon
// is deleted, so the bar image is the only way the icons are
// visible through the droplet, at rest as well as on hold. The bar
// always runs at 0.0. HONEST LIMIT: the bar's own live glass is
// not in the bar-included capture (a hardware RenderNode cannot
// draw into the software capture canvas), so the captured bar image
// carries the edge light, icons and labels over the UNBENT photo
// (no veil — it is hidden during the capture); the droplet's own
// rim bend + chain blur apply on top of that.
// nodeIsBar (BUILD 13): 1.0 while the node holds the BAR strip
// (whenever it exists for the droplet — only the node content gets
// the chain blur, so the bar image must BE the node content to
// stay blurred at rest and to sharpen to 0 blur on hold), 0.0 while
// it holds the background strip. It tells the shader which input is
// which side of the mix, so the mix is always background -> bar.
// See GlassView.buildEffect.
uniform shader barBackdrop;
uniform float barMix;
uniform float nodeIsBar;

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
    // BUILD 13: BOTH backdrops are sampled at the same uv and
    // mixed by barMix — the droplet always runs at barMix 1 (the
    // bar strip is the only way the icons are visible through it),
    // so the sample is the bar image at rest as well as on hold.
    // The mix happens BEFORE the tint/bend/sheens, so the whole
    // material — bend, vibrancy, sheen — operates on the mixed
    // image, exactly as if the bar had been the backdrop all along.
    // Which input is which side flips with nodeIsBar (see the
    // uniform comment): while the node holds the background strip
    // (backdrop = background, barBackdrop = bar) the bar side is
    // the raw input; while it holds the bar strip (backdrop = bar,
    // barBackdrop = background) the bar side is the chain-blurred
    // node content. The mix is always background -> bar.
    half3 refrBg = backdrop.eval(clamp(uv, float2(0.0), resolution - 1.0)).rgb;
    half3 refrBar = barBackdrop.eval(clamp(uv, float2(0.0), resolution - 1.0)).rgb;
    half3 refrFrom = mix(refrBg, refrBar, nodeIsBar);
    half3 refrTo = mix(refrBar, refrBg, nodeIsBar);
    half3 refracted = mix(refrFrom, refrTo, barMix);

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
    // there. BUILD 13: the base sample mixes background-only ->
    // bar-included by barMix, same as the refracted sample above
    // (same nodeIsBar side selection); the droplet always runs at
    // barMix 1, so the base is the bar image.
    half3 surfaceBg = backdrop.eval(magBase).rgb;
    half3 surfaceBar = barBackdrop.eval(magBase).rgb;
    half3 surfFrom = mix(surfaceBg, surfaceBar, nodeIsBar);
    half3 surfTo = mix(surfaceBar, surfaceBg, nodeIsBar);
    half3 surface = mix(mix(surfFrom, surfTo, barMix), tintColor, tintMix);
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

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
// MODES. One class, two shaders, chosen by the `mode` prop:
//   - "bar": the Anivio-adapted capsule shader (GlassBarShader.kt,
//     GPL-3.0, attribution kept below): tintMix fixed 0.30, tint
//     colour by mode, rim sheen, chromatic bend at the rim only.
//     The chain blur in front of it makes the bar smooth, not a
//     sharp photo.
//   - "droplet": Haziq's lens. Original shader: no tint, no blur,
//     completely clear. Magnification is zero at the exact centre
//     and grows toward the rim, so the middle icon reads clean.
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
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import expo.modules.kotlin.AppContext

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
    const val DEFAULT_TINT_MIX = 0.30f
    // Dark tint (28,28,30), the iOS 27 default fill colour.
    val DEFAULT_TINT_COLOR = floatArrayOf(28f / 255f, 28f / 255f, 30f / 255f)
    const val DEFAULT_MAGNIFICATION = 1.25f
    /** Blur radius in dp at the default Blur setting (50/100). */
    const val DEFAULT_BLUR_RADIUS_DP = 10f
  }

  private var mode: String = DEFAULT_MODE
  private var glowStrength: Float = DEFAULT_GLOW_STRENGTH
  private var tintMix: Float = DEFAULT_TINT_MIX
  private var tintColor: FloatArray = DEFAULT_TINT_COLOR.copyOf()
  private var magnification: Float = DEFAULT_MAGNIFICATION
  private var blurRadiusDp: Float = DEFAULT_BLUR_RADIUS_DP

  // Compiled for the current mode only. RuntimeShader (AGSL) needs
  // API 33+. Null below API 33, or if compilation ever fails — the
  // view then falls back to the Canvas tint and never crashes.
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
    val failure = cap.captureIfNeeded(root, root.drawingTime)
    if (failure != null) {
      Log.w(TAG, "backdrop capture failed (${failure.javaClass.simpleName}); reusing last frame")
    }
    // Only repaint when the backdrop under THIS view actually
    // changed. Comparing a cheap sampled hash breaks the old
    // self-sustaining 60fps capture -> invalidate loop: on a static
    // screen the hash settles and we stop; when content behind
    // scrolls or the droplet moves, onPreDraw fires from THAT
    // invalidation, the hash differs, and one fresh frame is
    // painted.
    val hash = backdropHash()
    if (!haveGoodCapture || hash != lastHash) {
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
      RuntimeShader(if (mode == "droplet") DROPLET_SHADER_SOURCE else BAR_SHADER_SOURCE)
        .also { shader = it }
    } catch (t: Throwable) {
      if (!shaderErrorLogged) {
        shaderErrorLogged = true
        Log.w(TAG, "AGSL shader failed to compile (${t.javaClass.simpleName}); using tint fallback", t)
      }
      null
    }
  }

  /**
   * Blur (bar only) -> AGSL material, as one chained RenderEffect
   * on the node. The material shader's `backdrop` uniform samples
   * the node's recorded content AFTER the blur, so the bar is
   * smooth glass, not a sharp photo. The droplet is a clear lens:
   * material only, no blur.
   */
  private fun buildEffect(shader: RuntimeShader, w: Int, h: Int): RenderEffect? {
    val density = resources.displayMetrics.density
    shader.setFloatUniform("resolution", w.toFloat(), h.toFloat())
    shader.setFloatUniform("density", density)
    shader.setFloatUniform("outset", OUTSET_DP * density)
    if (mode == "droplet") {
      shader.setFloatUniform("magnification", magnification)
    } else {
      shader.setFloatUniform("glowStrength", glowStrength)
      shader.setFloatUniform("tintMix", tintMix)
      shader.setFloatUniform("tintColor", tintColor[0], tintColor[1], tintColor[2])
    }
    return try {
      val material = RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
      if (mode == "droplet") return material
      val blurPx = (blurRadiusDp * density).coerceAtLeast(0f)
      if (blurPx <= 0f) return material
      val blur = RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
      RenderEffect.createChainEffect(material, blur)
    } catch (t: Throwable) {
      Log.w(TAG, "RenderEffect failed (${t.javaClass.simpleName}); drawing un-blurred", t)
      null
    }
  }
}

// The bar shader is adapted from GlassBarShader.kt in Anivio
// (https://github.com/mdtahseen7/Anivio), licensed under GPL-3.0.
// The only changes from Anivio's original are:
// - the `tintMix` uniform (fixed 0.30, the iOS 27 default fill)
//   replacing the hardcoded 0.55 in the surface mix;
// - the `tintColor` uniform, so the tint follows the navbar mode
//   (dark #1C1C1E / white) instead of always being dark.
//
// `backdrop` here is the captured bitmap drawn into the RenderNode:
// real backdrop pixels, blurred by the chain effect in front of
// this shader. It is NOT the view's own (empty) drawing — that was
// the builds 1-3 mistake.
private const val BAR_SHADER_SOURCE = """
uniform shader backdrop;
uniform float2 resolution;
uniform float density;
uniform float outset;
uniform float glowStrength;
uniform float tintMix;
uniform half3 tintColor;

half3 sampleLight(float2 position, float2 tangent) {
    float2 spread = tangent * density * 10.0;
    return backdrop.eval(position).rgb * 0.5
        + backdrop.eval(position - spread).rgb * 0.25
        + backdrop.eval(position + spread).rgb * 0.25;
}

half4 main(float2 position) {
    float2 halfSize = resolution * 0.5 - outset;
    float radius = halfSize.y;
    float2 local = position - resolution * 0.5;
    float2 capsule = float2(max(abs(local.x) - halfSize.x + radius, 0.0), local.y);
    float distanceToCenter = length(capsule);
    float distanceToEdge = distanceToCenter - radius;
    float coverage = 1.0 - smoothstep(-0.5, 0.5, distanceToEdge);
    if (coverage <= 0.0) return half4(0.0);
    float2 normal = float2(capsule.x * sign(local.x), capsule.y) / max(distanceToCenter, 0.001);
    float2 tangent = float2(-normal.y, normal.x);
    float depth = max(-distanceToEdge, 0.0) / density;
    half3 surface = mix(backdrop.eval(position).rgb, tintColor, tintMix);
    if (depth >= 16.0 || glowStrength <= 0.0) return half4(surface * coverage, coverage);
    float rim = exp(-0.0565 * depth - 0.0322 * depth * depth);
    float upperLight = 0.18 + 0.82 * pow(max(-normal.y, 0.0), 0.65);
    float bend = pow(rim, 0.18);
    half3 redLight = sampleLight(position - normal * density * 16.0 * bend, tangent);
    half3 greenLight = sampleLight(position - normal * density * 62.0 * bend, tangent);
    half3 blueLight = sampleLight(position - normal * density * 57.0 * bend, tangent);
    half3 refracted = half3(redLight.r, greenLight.g, blueLight.b);
    half luminance = dot(refracted, half3(0.2126, 0.7152, 0.0722));
    refracted = clamp(mix(half3(luminance), refracted, 1.25), 0.0, 1.0);
    half3 sheen = half3(0.1735, 0.0529, 0.0184) + refracted * half3(0.0953, 0.3152, 0.3822);
    half3 color = surface + sheen * rim * upperLight * glowStrength;
    float highlight = exp(-pow((depth - 0.35) / 0.42, 2.0));
    float highlightLight = 0.12 + 0.88 * sqrt(max((1.0 - normal.y) * 0.5, 0.0));
    color += half3(0.25) * highlight * highlightLight * glowStrength;
    return half4(clamp(color, 0.0, 1.0) * coverage, coverage);
}
"""

// Haziq's droplet: a completely transparent, refractive lens. No
// tint, no blur, no fill, no chromatic dispersion. The shader only
// bends the live backdrop, magnifying what sits behind the droplet
// (the icon under it) without scaling any view. The magnification
// is zero at the exact centre of the lens and increases toward the
// rim, so the icon sitting exactly in the middle reads clean.
//
// This shader is original work written for this navbar. It is NOT
// Anivio's shader.
private const val DROPLET_SHADER_SOURCE = """
uniform shader backdrop;
uniform float2 resolution;
uniform float density;
uniform float outset;
uniform float magnification;

half4 main(float2 position) {
    // Capsule SDF: the lens is a pill the size of the droplet frame.
    // `outset` insets the capsule 24dp inside this view's bounds.
    float2 halfSize = resolution * 0.5 - outset;
    float radius = halfSize.y;
    float2 local = position - resolution * 0.5;
    float2 capsule = float2(max(abs(local.x) - halfSize.x + radius, 0.0), local.y);
    float distanceToCenter = length(capsule);
    float distanceToEdge = distanceToCenter - radius;
    float coverage = 1.0 - smoothstep(-0.5, 0.5, distanceToEdge);
    if (coverage <= 0.0) return half4(0.0);

    // Magnifying lens. The sample point is pulled toward the centre:
    // at the exact centre local is (0,0), so the sample equals the
    // position and the displacement is ZERO — the middle icon reads
    // clean. Toward the rim the pull grows, so the bend and the
    // magnification increase toward the edge of the lens.
    float r = length(local) / max(radius, 0.001);
    float mag = 1.0 + (magnification - 1.0) * smoothstep(0.0, 1.0, r);
    float2 samplePos = resolution * 0.5 + local / mag;
    half3 color = backdrop.eval(samplePos).rgb;
    return half4(color * coverage, coverage);
}
"""

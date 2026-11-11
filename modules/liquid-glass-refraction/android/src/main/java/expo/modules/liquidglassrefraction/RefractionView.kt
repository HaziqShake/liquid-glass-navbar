// SPDX-License-Identifier: GPL-3.0
//
// Hardware refraction view for the liquid-glass navbar demo.
//
// The AGSL shader below is adapted from GlassBarShader.kt in Anivio
// (https://github.com/mdtahseen7/Anivio), licensed under GPL-3.0.
// The only changes from Anivio's original are:
// - the `tintMix` uniform (fixed 0.30, the iOS 27 default fill) replacing
//   the hardcoded 0.55 in the surface mix;
// - the `tintColor` uniform, so the tint follows the navbar mode
//   (dark #1C1C1E / white) instead of always being dark.
//
// This view uses the HARDWARE RenderEffect path
// (RenderEffect.createRuntimeShaderEffect). It performs no software
// backdrop capture, no bitmap snapshot, and uses no Skia. The
// shader's `backdrop` uniform samples whatever is drawn behind this
// view by the hardware renderer; the shader output replaces this
// view's own (empty) drawing.
//
// WHY BUILD 1 SHOWED NO REFRACTION (11 Nov, commit c52445e).
// The module was in the APK and the view mounted, but no effect ever
// appeared. The previous version gated the effect behind
// a size check: it only called setRenderEffect() once the view had
// a real size. That gate silently never passed on device — no Logcat
// line ever proved it did — so the view stayed transparent forever
// and only the BlurView showed. This version applies the
// RenderEffect EAGERLY in init (API 33+, shader present) and never
// gates on size. A zero-size application is harmless: the shader is
// safe at resolution (0,0) (see the zero-size note below) and renders
// transparent, then turns real the moment updateUniforms() runs with
// a real size. The uniforms are re-asserted on EVERY onSizeChanged,
// onLayout, onAttachedToWindow (via post) and every prop change, and
// EVERY attempt is logged, so a device Logcat proves exactly what
// happened instead of failing silently.
//
// ZERO-SIZE SAFETY: with resolution (0,0), halfSize = -outset and
// radius = -outset (both negative), so distanceToEdge = length(local)
// + outset > 0.5 everywhere and coverage = 1 - smoothstep(...) = 0:
// the shader returns transparent for every pixel before reaching
// the normal/depth math. The normal's division is guarded by
// max(distanceToCenter, 0.001) in any case, so no NaN is possible.

package expo.modules.liquidglassrefraction

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.util.Log
import android.view.View
import expo.modules.kotlin.AppContext

@SuppressLint("ViewConstructor")
class RefractionView(context: Context, appContext: AppContext) : View(context) {

  companion object {
    private const val TAG = "RefractionView"
    // The shader samples 24dp beyond the bar on every side, so the
    // consumer must lay this view out 24dp larger than the bar on
    // every side (e.g. left/top/right/bottom: -24, or explicit
    // width/height = bar + 48) inside an overflow-hidden container
    // that clips it to the pill shape.
    const val OUTSET_DP = 24f

    const val DEFAULT_GLOW_STRENGTH = 1.0f
    const val DEFAULT_TINT_MIX = 0.30f
    // Dark tint (28,28,30), the iOS 27 default fill colour.
    val DEFAULT_TINT_COLOR = floatArrayOf(28f / 255f, 28f / 255f, 30f / 255f)
  }

  private var glowStrength: Float = DEFAULT_GLOW_STRENGTH
  private var tintMix: Float = DEFAULT_TINT_MIX
  private var tintColor: FloatArray = DEFAULT_TINT_COLOR.copyOf()
  private var effectApplied = false

  // Compiled once. RuntimeShader (AGSL) requires API 33+.
  private val shader: RuntimeShader? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      RuntimeShader(SHADER_SOURCE)
    } else {
      null
    }

  init {
    // The view draws nothing itself; the RenderEffect output is the
    // refracted backdrop. Keep the background transparent.
    // EAGER: apply the effect NOW, even though the view has no size
    // yet. Do NOT gate on size — the size gate is what silently
    // failed in build 1. A zero-size application renders transparent
    // and turns real as soon as updateUniforms() runs with a real
    // size, because the shader object is shared and its uniforms
    // update live.
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
    applyEffect()
  }

  fun setGlowStrength(value: Float) {
    if (glowStrength == value) return
    glowStrength = value
    updateUniforms()
  }

  fun setTintMix(value: Float) {
    if (tintMix == value) return
    tintMix = value
    updateUniforms()
  }

  fun setTintColor(r: Float, g: Float, b: Float) {
    if (tintColor[0] == r && tintColor[1] == g && tintColor[2] == b) return
    tintColor = floatArrayOf(r, g, b)
    updateUniforms()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    Log.d(TAG, "onSizeChanged: ${w}x${h} (was ${oldw}x${oldh}) effectApplied=$effectApplied")
    updateUniforms()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    Log.d(TAG, "onLayout: changed=$changed size=${width}x${height} effectApplied=$effectApplied")
    updateUniforms()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    Log.d(TAG, "onAttachedToWindow: size=${width}x${height} effectApplied=$effectApplied")
    // Attach can precede the first layout; post so this runs after
    // the layout pass, when width/height are real.
    post {
      Log.d(TAG, "onAttachedToWindow(post): size=${width}x${height} effectApplied=$effectApplied")
      applyEffect()
      updateUniforms()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setRenderEffect(null)
    }
    effectApplied = false
    Log.d(TAG, "onDetachedFromWindow: effect cleared")
  }

  /**
   * Apply the RenderEffect. Called eagerly from init and re-asserted
   * on re-attach. Never gated on size: a zero-size application is
   * harmless (the shader returns transparent until the uniforms
   * arrive) and gating is exactly what failed silently in build 1.
   */
  private fun applyEffect() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      Log.d(TAG, "applyEffect: SKIPPED, API ${Build.VERSION.SDK_INT} < 33, no RuntimeShader")
      return
    }
    val shader = shader
    if (shader == null) {
      Log.d(TAG, "applyEffect: SKIPPED, shader is null size=${width}x${height}")
      return
    }
    if (effectApplied) {
      Log.d(TAG, "applyEffect: already applied size=${width}x${height}")
      return
    }
    setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
    effectApplied = true
    Log.d(TAG, "applyEffect: EFFECT SET size=${width}x${height} tintMix=$tintMix")
  }

  /**
   * Push the current props and size into the shared shader object.
   * The effect already holds this shader, so the output updates live.
   * Called on every size/layout/attach event and every prop change.
   * Also re-asserts the effect if it was ever lost, so no path can
   * leave the view without one.
   */
  private fun updateUniforms() {
    val shader = shader
    if (shader == null) {
      Log.d(TAG, "updateUniforms: SKIPPED, no shader size=${width}x${height}")
      return
    }
    if (!effectApplied) {
      Log.d(TAG, "updateUniforms: effect missing, re-applying size=${width}x${height}")
      applyEffect()
    }
    if (width <= 0 || height <= 0) {
      Log.d(TAG, "updateUniforms: SKIPPED, zero size ${width}x${height} effectApplied=$effectApplied")
      return
    }
    val density = resources.displayMetrics.density
    shader.setFloatUniform("resolution", width.toFloat(), height.toFloat())
    shader.setFloatUniform("density", density)
    shader.setFloatUniform("outset", OUTSET_DP * density)
    shader.setFloatUniform("glowStrength", glowStrength)
    shader.setFloatUniform("tintMix", tintMix)
    shader.setFloatUniform("tintColor", tintColor[0], tintColor[1], tintColor[2])
    invalidate()
    Log.d(TAG, "updateUniforms: SET resolution=${width}x${height} density=$density effectApplied=$effectApplied")
  }
}

private const val SHADER_SOURCE = """
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

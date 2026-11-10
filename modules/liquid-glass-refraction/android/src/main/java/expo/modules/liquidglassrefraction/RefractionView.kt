// SPDX-License-Identifier: GPL-3.0
//
// Hardware refraction view for the liquid-glass navbar demo.
//
// The AGSL shader below is adapted from GlassBarShader.kt in Anivio
// (https://github.com/mdtahseen7/Anivio), licensed under GPL-3.0.
// The only change from Anivio's original is the `tintMix` uniform
// (default 0.30, matching the iOS 27 default fill) replacing the
// hardcoded 0.55 in the surface mix.
//
// This view uses the HARDWARE RenderEffect path
// (RenderEffect.createRuntimeShaderEffect). It performs no software
// backdrop capture, no bitmap snapshot, and uses no Skia. The
// shader's `backdrop` uniform samples whatever is drawn behind this
// view by the hardware renderer; the shader output replaces this
// view's own (empty) drawing.

package expo.modules.liquidglassrefraction

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.view.View
import expo.modules.kotlin.AppContext

@SuppressLint("ViewConstructor")
class RefractionView(context: Context, appContext: AppContext) : View(context) {

  companion object {
    // The shader samples 24dp beyond the bar on every side, so the
    // consumer must lay this view out 24dp larger than the bar on
    // every side (e.g. left/top/right/bottom: -24) inside an
    // overflow-hidden container that clips it to the pill shape.
    const val OUTSET_DP = 24f

    const val DEFAULT_GLOW_STRENGTH = 1.0f
    const val DEFAULT_TINT_MIX = 0.30f
  }

  private var glowStrength: Float = DEFAULT_GLOW_STRENGTH
  private var tintMix: Float = DEFAULT_TINT_MIX

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

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    // Size drives the `resolution` uniform; re-apply so the lens
    // geometry matches the new frame.
    updateUniforms()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    applyEffect()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setRenderEffect(null)
    }
  }

  private fun updateUniforms() {
    val shader = shader ?: return
    if (width <= 0 || height <= 0) return
    val density = resources.displayMetrics.density
    shader.setFloatUniform("resolution", width.toFloat(), height.toFloat())
    shader.setFloatUniform("density", density)
    shader.setFloatUniform("outset", OUTSET_DP * density)
    shader.setFloatUniform("glowStrength", glowStrength)
    shader.setFloatUniform("tintMix", tintMix)
  }

  private fun applyEffect() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      // Below API 33 there is no RuntimeShader: leave the view
      // transparent with no effect.
      return
    }
    val shader = shader ?: return
    updateUniforms()
    setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
  }
}

private const val SHADER_SOURCE = """
uniform shader backdrop;
uniform float2 resolution;
uniform float density;
uniform float outset;
uniform float glowStrength;
uniform float tintMix;

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
    half3 surface = mix(backdrop.eval(position).rgb, half3(28.0, 28.0, 30.0) / 255.0, tintMix);
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

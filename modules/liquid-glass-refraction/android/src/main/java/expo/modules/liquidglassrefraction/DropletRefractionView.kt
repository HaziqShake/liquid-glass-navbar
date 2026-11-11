// SPDX-License-Identifier: GPL-3.0
//
// Hardware magnifying-lens view for the liquid-glass navbar's droplet.
//
// This is Haziq's droplet: a completely transparent, refractive lens.
// No tint, no blur, no fill, no chromatic dispersion. The shader only
// bends the live backdrop, magnifying what sits behind the droplet
// (the icons under it) without scaling any view. The magnification is
// zero at the exact centre of the lens and increases toward the rim,
// so the icon sitting exactly in the middle reads clean and
// undistorted.
//
// This shader is original work written for this navbar. It is NOT
// Anivio's shader: Anivio's GlassBarShader bends with chromatic
// dispersion and mixes in a tint and a sheen; this one only magnifies.
//
// This view uses the HARDWARE RenderEffect path
// (RenderEffect.createRuntimeShaderEffect). It performs no software
// backdrop capture, no bitmap snapshot, and uses no Skia. The
// shader's `backdrop` uniform samples whatever is drawn behind this
// view by the hardware renderer; the shader output replaces this
// view's own (empty) drawing.
//
// SIZE RULE (the crash fix from the bar view, applied here too): the
// shader's uniforms are never set at zero size. RuntimeShader uniforms
// default to 0, so a zero `resolution` collapses the capsule SDF and
// the shader draws transparent everywhere. ensureEffect() only runs
// once the view has a real size, and it is called from onSizeChanged,
// onLayout AND onAttachedToWindow (via post, so it runs after the
// first layout pass). A Log.d line records the size when the effect is
// applied, so a Logcat shows whether the uniforms were set. The
// consumer must lay this view out with an explicit size (droplet frame
// + 48dp, at left/top -24dp) so its size can never be zero.

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
class DropletRefractionView(context: Context, appContext: AppContext) : View(context) {

  companion object {
    private const val TAG = "DropletRefractionView"
    // The shader samples 24dp beyond the droplet frame on every side,
    // so the consumer must lay this view out 24dp larger than the
    // droplet frame on every side (explicit width/height = frame + 48)
    // inside an overflow-hidden container that clips it to the pill.
    const val OUTSET_DP = 24f

    const val DEFAULT_MAGNIFICATION = 1.25f
  }

  private var magnification: Float = DEFAULT_MAGNIFICATION
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
    // magnified backdrop. Keep the background transparent.
    // NOTE: do NOT apply the RenderEffect here. At construction the
    // view has no size yet, so the uniforms would all be zero and the
    // shader would draw transparent. ensureEffect() applies the effect
    // only once the view has a real size (see onSizeChanged/onLayout).
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
  }

  fun setMagnification(value: Float) {
    if (magnification == value) return
    magnification = value
    updateUniforms()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    // Size drives the `resolution` uniform; (re)apply the effect so
    // the lens geometry matches the new frame.
    ensureEffect()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    // Belt and braces next to onSizeChanged: layout is the point where
    // the size is guaranteed real, so assert the effect here too.
    if (changed) ensureEffect()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // Attach can precede the first layout; post so this runs after the
    // layout pass, when width/height are real.
    post { ensureEffect() }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setRenderEffect(null)
    }
    effectApplied = false
  }

  private fun updateUniforms() {
    val shader = shader ?: return
    if (width <= 0 || height <= 0) return
    val density = resources.displayMetrics.density
    shader.setFloatUniform("resolution", width.toFloat(), height.toFloat())
    shader.setFloatUniform("density", density)
    shader.setFloatUniform("outset", OUTSET_DP * density)
    shader.setFloatUniform("magnification", magnification)
    invalidate()
  }

  /**
   * Apply the RenderEffect, but ONLY once the view has a real size.
   * Applying it earlier (e.g. in init) leaves the shader uniforms at
   * zero, which makes the capsule SDF collapse and the shader draw
   * transparent everywhere. Safe to call repeatedly: it re-asserts the
   * uniforms and only (re)sets the effect once.
   */
  private fun ensureEffect() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      // Below API 33 there is no RuntimeShader: leave the view
      // transparent with no effect.
      return
    }
    val shader = shader ?: return
    if (width <= 0 || height <= 0) return
    updateUniforms()
    if (!effectApplied) {
      setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
      effectApplied = true
      Log.d(TAG, "droplet effect applied, size=${width}x${height} magnification=$magnification")
    }
  }
}

private const val SHADER_SOURCE = """
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
    // magnification increase toward the edge of the lens. The sample
    // point always stays between the position and the centre, so it
    // never leaves this view's bounds.
    float r = length(local) / max(radius, 0.001);
    float mag = 1.0 + (magnification - 1.0) * smoothstep(0.0, 1.0, r);
    float2 samplePos = resolution * 0.5 + local / mag;
    half3 color = backdrop.eval(samplePos).rgb;
    return half4(color * coverage, coverage);
}
"""

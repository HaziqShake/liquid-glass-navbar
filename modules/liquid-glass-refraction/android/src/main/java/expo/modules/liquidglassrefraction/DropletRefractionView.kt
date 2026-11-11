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
// WHY BUILD 1 SHOWED NO DROPLET (11 Nov, commit c52445e).
// The module was in the APK and the view mounted, but nothing was
// ever visible. The previous version gated the effect behind
// a size check: it only called setRenderEffect() once the view had
// a real size. That gate silently never passed on device — no Logcat
// line ever proved it did — so the lens stayed transparent forever.
// This version applies the RenderEffect EAGERLY in init (API 33+,
// shader present) and never gates on size. A zero-size application
// is harmless: the shader is safe at resolution (0,0) (see the
// zero-size note below) and renders transparent, then turns real the
// moment updateUniforms() runs with a real size. The uniforms are
// re-asserted on EVERY onSizeChanged, onLayout, onAttachedToWindow
// (via post) and every prop change, and EVERY attempt is logged, so
// a device Logcat proves exactly what happened instead of failing
// silently. The consumer must lay this view out with an explicit
// size (droplet frame + 48dp, at left/top -24dp) so its size can
// never be zero.
//
// ZERO-SIZE SAFETY: with resolution (0,0), halfSize = -outset and
// radius = -outset (both negative), so distanceToEdge = length(local)
// + outset > 0.5 everywhere and coverage = 1 - smoothstep(...) = 0:
// the shader returns transparent for every pixel before reaching
// the magnification math. The magnification's division is guarded by
// max(radius, 0.001) in any case, so no NaN is possible.

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
    // EAGER: apply the effect NOW, even though the view has no size
    // yet. Do NOT gate on size — the size gate is what silently
    // failed in build 1. A zero-size application renders transparent
    // and turns real as soon as updateUniforms() runs with a real
    // size, because the shader object is shared and its uniforms
    // update live.
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
    applyEffect()
  }

  fun setMagnification(value: Float) {
    if (magnification == value) return
    magnification = value
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
    Log.d(TAG, "applyEffect: EFFECT SET size=${width}x${height} magnification=$magnification")
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
    shader.setFloatUniform("magnification", magnification)
    invalidate()
    Log.d(TAG, "updateUniforms: SET resolution=${width}x${height} density=$density effectApplied=$effectApplied")
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

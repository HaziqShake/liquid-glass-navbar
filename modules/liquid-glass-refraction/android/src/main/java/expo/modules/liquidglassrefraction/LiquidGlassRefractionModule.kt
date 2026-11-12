// SPDX-License-Identifier: GPL-3.0
//
// Expo module definition for the hardware liquid-glass view.
// The bar AGSL shader is adapted from GlassBarShader.kt in Anivio
// (https://github.com/mdtahseen7/Anivio), licensed under GPL-3.0;
// the droplet lens shader is original.
//
// One native view class, GlassView, with a `mode` prop ("bar" |
// "droplet"). It does NOT put a RenderEffect on an empty view —
// that was the builds 1-3 mistake (the shader input would be
// transparent). Instead it captures the root once per frame into
// one shared half-resolution bitmap (SharedBackdrop) and draws that
// bitmap through a hardware RenderNode with the AGSL effect, so
// the shader bends real backdrop pixels.

package expo.modules.liquidglassrefraction

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiquidGlassRefractionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiquidGlassRefraction")

    // BUILD 6 verification aid: the native glass state, as a
    // two-line string, refreshed by the DemoScreen about once a
    // second and printed on screen. Format:
    //   "cap 540x1200 | nav Y hid Y | drawn Y (bar)
    //    hash 1a2b3c4d | rect 24,890,372,1012"
    // cap = shared backdrop bitmap size; nav = a navbar root was
    // found; hid = it was actually hidden during the last capture;
    // drawn = the RenderEffect path drew at least once; hash/rect
    // = the last backdrop hash and this view's rectangle in the
    // bitmap. REMOVE before final delivery.
    AsyncFunction("getGlassDebug") {
      GlassDebugState.snapshot()
    }

    View(GlassView::class) {
      Name("GlassView")

      Prop("mode", GlassView.DEFAULT_MODE) { view: GlassView, mode: String ->
        view.setMode(mode)
      }

      Prop("glowStrength", GlassView.DEFAULT_GLOW_STRENGTH) { view: GlassView, glowStrength: Float ->
        view.setGlowStrength(glowStrength)
      }

      // BUILD 8 DIAGNOSTIC. Multiplies the bar shader's coherent
      // displacement (56dp * bend * bendScale). Default 1.0 = the
      // shipped look. The JS settings' bendDiagnostic switch sets
      // it to 3.0, so the device check can see whether ANY
      // displacement reaches the screen. Never the shipped look
      // by default. Droplet mode ignores it.
      Prop("bendScale", GlassView.DEFAULT_BEND_SCALE) { view: GlassView, bendScale: Float ->
        view.setBendScale(bendScale)
      }

      Prop("tintMix", GlassView.DEFAULT_TINT_MIX) { view: GlassView, tintMix: Float ->
        view.setTintMix(tintMix)
      }

      // Tint colour the shader mixes into the sampled backdrop.
      // Follows the navbar mode: dark (28,28,30) or white (255,255,255).
      // This is WHAT colour the tint is, not how much of it there is;
      // the amount is the fixed tintMix (0.15, build 6), never a user setting.
      Prop("tintColor", GlassView.DEFAULT_TINT_COLOR.map { it.toDouble() }) { view: GlassView, tintColor: List<Double> ->
        if (tintColor.size >= 3) {
          view.setTintColor(tintColor[0].toFloat(), tintColor[1].toFloat(), tintColor[2].toFloat())
        }
      }

      // Lens magnification at the rim of the droplet. 1.0 is no lens.
      // The displacement is zero at the exact centre and grows toward
      // the rim, so the middle icon reads clean. Default 1.35 (build 6).
      Prop("magnification", GlassView.DEFAULT_MAGNIFICATION) { view: GlassView, magnification: Float ->
        view.setMagnification(magnification)
      }

      // Blur radius in dp for the bar's chain blur effect. The
      // droplet never blurs. Default 10dp.
      Prop("blurRadius", GlassView.DEFAULT_BLUR_RADIUS_DP) { view: GlassView, blurRadius: Float ->
        view.setBlurRadius(blurRadius)
      }
    }
  }
}

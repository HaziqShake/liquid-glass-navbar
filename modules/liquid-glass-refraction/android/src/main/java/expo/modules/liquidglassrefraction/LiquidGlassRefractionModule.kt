// SPDX-License-Identifier: GPL-3.0
//
// Expo module definition for the hardware refraction view.
// The AGSL shader used by RefractionView is adapted from
// GlassBarShader.kt in Anivio (https://github.com/mdtahseen7/Anivio),
// licensed under GPL-3.0.

package expo.modules.liquidglassrefraction

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiquidGlassRefractionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiquidGlassRefraction")

    View(RefractionView::class) {
      Name("RefractionView")

      Prop("glowStrength", RefractionView.DEFAULT_GLOW_STRENGTH) { view: RefractionView, glowStrength: Float ->
        view.setGlowStrength(glowStrength)
      }

      Prop("tintMix", RefractionView.DEFAULT_TINT_MIX) { view: RefractionView, tintMix: Float ->
        view.setTintMix(tintMix)
      }

      // Tint colour the shader mixes into the sampled backdrop.
      // Follows the navbar mode: dark (28,28,30) or white (255,255,255).
      // This is WHAT colour the tint is, not how much of it there is;
      // the amount is the fixed tintMix (0.30), never a user setting.
      Prop("tintColor", RefractionView.DEFAULT_TINT_COLOR.map { it.toDouble() }) { view: RefractionView, tintColor: List<Double> ->
        if (tintColor.size >= 3) {
          view.setTintColor(tintColor[0].toFloat(), tintColor[1].toFloat(), tintColor[2].toFloat())
        }
      }
    }

    // Haziq's droplet: a completely transparent magnifying lens. No
    // tint, no blur, no fill. The magnification is zero at the exact
    // centre of the lens and grows toward the rim.
    View(DropletRefractionView::class) {
      Name("DropletRefractionView")

      Prop("magnification", DropletRefractionView.DEFAULT_MAGNIFICATION) { view: DropletRefractionView, magnification: Float ->
        view.setMagnification(magnification)
      }
    }
  }
}

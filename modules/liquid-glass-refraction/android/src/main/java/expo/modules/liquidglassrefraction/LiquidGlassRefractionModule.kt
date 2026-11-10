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

      // Tint colour mixed into the backdrop (linear 0..1 floats).
      // Dark mode passes the dark #1C1C1E default; light mode passes
      // white so the refraction mixes a light tint. The default here is
      // the dark tint; the JS side always passes an explicit value.
      Prop("tintColor", listOf(28.0 / 255.0, 28.0 / 255.0, 30.0 / 255.0)) { view: RefractionView, tintColor: List<Double> ->
        if (tintColor.size >= 3) {
          view.setTintColor(tintColor[0].toFloat(), tintColor[1].toFloat(), tintColor[2].toFloat())
        }
      }
    }
  }
}

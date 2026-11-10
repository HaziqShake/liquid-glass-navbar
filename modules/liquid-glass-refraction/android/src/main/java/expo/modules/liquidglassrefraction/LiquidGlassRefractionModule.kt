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
    }
  }
}

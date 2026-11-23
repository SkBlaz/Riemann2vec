const arithmetic = "src/Development/AutomorphicArithmetic/";
const boxes = arithmetic + "CharacterBoxes/";
const theta = arithmetic + "ThetaCorrespondence/ThetaPairLifts/ThirdPlaceSeries/";
const gamma = "src/Formalism/GammaFactorNonvanishing/";
const windowRoot = "src/Formalism/SharpRestriction/RamificationFrobenius/TotientGaloisClasses/";
const windowPath = windowRoot + "TopWin.lean";

export const chapters = [
  {
    id: "statement", group: "The statements", title: "What Lean proves",
    summary: "Every nontrivial zero of the Riemann zeta function lies on the critical line. Main.lean exports this result with Mathlib’s RiemannHypothesis type, alongside the corresponding results for Dirichlet L-functions.",
    formula: "ζ(s) = 0,  s ∉ {−2, −4, …},  s ≠ 1   ⟹   Re(s) = ½",
    reading: "The proof in Main.lean is one name, rhOfAll. Open its definition to see where the nonvanishing result allChi enters. Statements.lean gives the precise hypotheses on the strip and the pole.",
    references: [
      ["src/Main.lean", 4, "riemannHypothesis", "Exported theorem"],
      ["src/Supplements/Kernels/MainTheorems.lean", 9, "rhOfAll", "Final assembly"],
      ["src/Statements.lean", 3, "RiemannZetaZerosOnLine", "Explicit zeta statement"],
      ["src/Statements.lean", 10, "DirichletLZerosOnLine", "Explicit GRH statement"],
    ],
    embeddingSource: [gamma + "CritLine.lean", 32, "LFunction_modOne_eq", "The zeta identity in the proof body"],
    term: "riemannZeta",
    next: [["zeta-reduction", "Follow the zeta proof"], ["dirichlet-strip", "Follow the GRH branch"]],
  },
  {
    id: "zeta-reduction", group: "The analytic reductions", title: "Specialize to the trivial character",
    summary: "The zeta proof uses the general half-plane theorem at level 1, with the trivial Dirichlet character. The identity L(s, 1 mod 1) = ζ(s) then supplies right-half-plane nonvanishing for zeta.",
    formula: "All-character nonvanishing   ⟹   ζ(s) ≠ 0 for Re(s) > ½, s ≠ 1",
    reading: "Read the short body of rh_of_every. The type of rh_of_right isolates exactly what remains after specializing χ. The condition s ≠ 1 supplies the second disjunct in the half-plane statement.",
    references: [
      [gamma + "CritLine.lean", 29, "Formalism.VW.rh_of_every", "Specialization to level 1"],
      [gamma + "RhOfRight.lean", 5, "Formalism.VW.rh_of_right", "The resulting zeta obligation"],
      [boxes + "EveryCharacter.lean", 13, "UpperTheory.EveryCharacter", "Input proposition"],
    ],
    next: [["zeta-reflection", "Read the zeta reflection argument"], ["half-plane", "Find the nonvanishing theorem"]],
  },
  {
    id: "zeta-reflection", group: "The analytic reductions", title: "Reflect a zeta zero",
    summary: "Lean splits on Re(s) relative to ½. When Re(s) < ½ it applies the functional equation at 1 − s and contradicts right-half-plane nonvanishing. The gamma and power factors are nonzero there, and the possible cosine zeros lead to the excluded trivial zeros or to s = 0, which is handled separately.",
    formula: "Re(s) < ½   ⟹   Re(1 − s) > ½",
    reading: "At the functional equation call, track the four nonvanishing factors in the final contradiction. The case Re(s) > ½ uses the supplied hypothesis directly.",
    references: [
      [gamma + "RhOfRight.lean", 5, "Formalism.VW.rh_of_right", "Three real-part cases"],
      [gamma + "RhOfRight.lean", 28, "riemannZeta_one_sub", "Functional equation in the proof body"],
      [gamma + "RhOfRight.lean", 34, "hcos", "Cosine factor in the proof body"],
    ],
    term: "gammaFactor",
    next: [["half-plane", "Read the common input"], ["dirichlet-strip", "Compare Dirichlet reflection"]],
  },
  {
    id: "dirichlet-strip", group: "The analytic reductions", title: "Handle the character conductor",
    summary: "For a zero with 0 < Re(s) < ½, Claim.strip first passes to the inducing primitive character, then reflects to a zero of its inverse character at 1 − s. The half-plane theorem rules that zero out. A zero with Re(s) > ½ is excluded directly.",
    formula: "L(s, χ) = 0   ⟹   L(s, χprim) = 0   ⟹   L(1 − s, χprim⁻¹) = 0",
    reading: "Check why the finite Euler factors in the change-of-level formula are nonzero for Re(s) > 0. In the primitive reflection lemma, see where the gamma factors are cleared from the completed L-function.",
    references: [
      ["src/Main.lean", 10, "LFunction_eq_zero_re", "Exported GRH theorem"],
      [boxes + "ClaimStrip.lean", 59, "Claim.strip", "Strip reduction"],
      [boxes + "ClaimStrip.lean", 23, "Claim.prim_zero", "Pass to the inducing character"],
      [boxes + "ClaimStrip.lean", 42, "Claim.prim_reflect", "Apply the functional equation"],
      [gamma + "CritLine.lean", 11, "Formalism.VW.critLine", "Separate primitive case"],
    ],
    term: "DirichletCharacter",
    next: [["half-plane", "Read the common input"]],
  },
  {
    id: "half-plane", group: "Where nonvanishing comes from", title: "Locate the common input",
    summary: "UpperTheory.EveryCharacter is the proposition that L(s, χ) is nonzero to the right of ½ for every level and character, excluding the pair χ = 1 and s = 1. MainTheorems obtains it from MainConclusion and supplies it to the analytic reductions.",
    formula: "Re(s) > ½,  (χ ≠ 1 ∨ s ≠ 1)   ⟹   L(s, χ) ≠ 0",
    reading: "Read everyCharacter and everyCharacter_of_row together. The first supplies the Galois input for the second. The second constructs an automorphic window and invokes the theorem that assembles it with the other inputs.",
    references: [
      [boxes + "EveryCharacter.lean", 13, "UpperTheory.EveryCharacter", "The proposition"],
      ["src/Supplements/Kernels/MainTheorems.lean", 7, "allChi", "Input to the exported theorems"],
      [boxes + "MainConclusion.lean", 10, "UpperTheory.FinalTheorems.everyCharacter", "Unconditional theorem"],
      [boxes + "MainConclusion.lean", 7, "UpperTheory.FinalTheorems.everyCharacter_of_row", "Assembly from the Galois input"],
    ],
    term: "DirichletCharacter.LFunction",
    next: [["automorphic-window", "Trace the Galois and window inputs"], ["assembly", "Trace how the inputs combine"]],
  },
  {
    id: "automorphic-window", group: "Where nonvanishing comes from", title: "Follow the Galois input to VWin",
    summary: "MainConclusion supplies a Row0b witness obtained from a theta lift. It uses that witness to build a VWin input via an open image condition and base change. The VWin definition quantifies over primitive characters and supplies VAt data on a range of scales.",
    formula: "Row0b   ⟹   VWin,   with VWin := ∀ ψ : PChar, VWinAt ψ 401",
    reading: "Read VWinAt itself to see the nested quantifiers in ε, the choice of auxiliary function, and the intervals [Y, Y²]. The window in this input has its own definition. Follow the later Chebyshev theorem to see the scale used in the analytic argument.",
    references: [
      [arithmetic + "Foundations/GaloisRepresentations/IntegralStructures/RowSrc.lean", 6, "galoisLocalGlobalStrong_recParameter", "The Row0b witness"],
      [arithmetic + "AutomorphicVarieties/ModularityArgument/ThresholdArguments/DenseThresholdCases/VwinOfRow.lean", 4, "UpperTheory.One.vwin_of_row", "Construct the VWin input"],
      [boxes + "ExistsPageN.lean", 44, "VWinAt", "Window quantifiers"],
      [boxes + "ExistsPageN.lean", 49, "VWin", "Uniform proposition over primitive characters"],
    ],
    next: [["assembly", "See where VWin is consumed"], ["chebyshev", "Read the later analytic window"]],
  },
  {
    id: "assembly", group: "Where nonvanishing comes from", title: "Combine the automorphic inputs",
    summary: "The assembly theorem feeds theta-integral agreement, local matching, a covolume bound, local Langlands input and VWin into every_character_of_theta_integrals_local_matching. The latter produces the inputs for TopPlug, where the primitive zero-free theorem is extended to all characters.",
    formula: "Theta and local matching inputs, covolume bound, RecTExists, VWin   ⟹   EveryCharacter",
    reading: "Use the type of every_character_of_theta_integrals_local_matching as a checklist. TopPlug separates construction of the primitive zero-free result from the Euler-factor argument for all characters.",
    references: [
      [theta + "EveryCharacterOfLiteratureOfVWin.lean", 810, "UpperTheory.LiteratureTheorems.every_character_of_literature_of_vWin", "The assembly call"],
      [theta + "SiegelEisensteinSecondTermHypotheses.lean", 69, "every_character_of_theta_integrals_local_matching", "Input types and their use"],
      [theta + "TopPlug.lean", 12, "UpperTheory.Top.zero_free_all_of_green_v_win", "Primitive nonvanishing"],
      [theta + "TopPlug.lean", 16, "UpperTheory.Top.every_character_of_green_v_win", "Extension to all characters"],
      [boxes + "Imprimitive.lean", 5, "UpperTheory.Top.imprimitive", "Change of level and Euler factors"],
    ],
    next: [["chebyshev", "Follow the analytic window reduction"], ["automorphic-window", "Inspect the VWin input"]],
  },
  {
    id: "chebyshev", group: "Where nonvanishing comes from", title: "Read the Chebyshev window criterion",
    summary: "The primitive nonvanishing step applies zeroFreeAll_of_topG at scale exponent 3/2. Its proof supplies comparison and FormB hypotheses for the cyclotomic level and passes the tied-window estimates to zeroFreeOn_of_tiedWin_cyc.",
    formula: "Chebyshev window hypotheses + FormB at cyclotomic levels   ⟹   ZeroFreeOn",
    reading: "Compare the types of ChebyshevInequalityOnWindows and ChebyshevInequalityAtWindowScale in the displayed theorem. The next layer of the formal argument is the construction of the specific estimates and the use of FormB inside level_of_tiedWin.",
    references: [
      [theta + "TopPlug.lean", 14, "zeroFreeAll_of_topG", "The choice of exponent 3/2"],
      [boxes + "ZeroFreeAllOfTopG.lean", 26, "zeroFreeAll_of_topG", "Collect the hypotheses"],
      [windowPath, 90, "zeroFreeOn_of_tiedWin_cyc", "Cyclotomic specialization"],
      [windowPath, 83, "zeroFreeOn_of_tiedWin", "The general tied-window theorem"],
    ],
    embeddingSource: [windowPath, 28, "Λ.Gm", "The quantity in the Chebyshev bound"],
    term: "Gm",
    next: [["landau-window", "See how the bound excludes a zero"], ["assembly", "Return to the input assembly"]],
  },
  {
    id: "landau-window", group: "Where nonvanishing comes from", title: "Use a one-sided bound to exclude a zero",
    summary: "At a proposed zero s with Re(s) > ½, level_of_tiedWin chooses ε small enough that the exponent in the Chebyshev estimate is below a threshold θ < Re(s). FormBAt says that upper bounds with exponent θ on arbitrarily far-out windows imply zero-freeness above θ for the characters retained at that level.",
    formula: "½ + (eD + eL + 7)ε ≤ θ < Re(s),   with θ = ½ + ½ min(Re(s) − ½, ½)",
    reading: "Compare the estimate for Λ.Gm in ChebyshevInequalityOnWindows with the input of FormBAt. The upper bound is one-sided. FormB identifies Λ with a character family and invokes the Landau window theorem, with δ = λ − 1.",
    references: [
      [windowPath, 68, "level_of_tiedWin", "Choose ε and θ for the proposed zero"],
      [windowPath, 26, "ChebyshevInequalityOnWindows", "One-sided estimate on the family window"],
      [windowRoot + "Window.lean", 30, "FormBAt", "Window bound implies zero-freeness"],
      [arithmetic + "PrimitiveCosets/Imports.lean", 8, "UpperTheory.Comparison₂.formB", "Translate to a character family"],
      [arithmetic + "DedekindLFunctions/LandauTheorems/ZeroFreeOfRpowWindow.lean", 11, "zeroFree_of_rpow_window", "The Landau window theorem"],
      [windowRoot + "ExplicitFormulaErrorOfHostConditions.lean", 38, "Gm", "The prime-side quantity at a level"],
    ],
    embeddingSource: [windowRoot + "ExplicitFormulaErrorOfHostConditions.lean", 38, "Formalism.HC.Level.Gm", "The prime-side quantity at a level"],
    term: "Gm",
    next: [["chebyshev", "Review the window hypotheses"], ["half-plane", "Return to the half-plane theorem"]],
  },
];

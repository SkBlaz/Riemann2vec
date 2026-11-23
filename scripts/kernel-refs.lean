import Lean

open Lean

def constantNames (expr : Expr) : Json :=
  toJson <| (expr.getUsedConstants.map Name.toString).qsort (· < ·)

def main (args : List String) : IO UInt32 := do
  let [file, name] := args
    | throw <| IO.userError "Expected a compiled module and declaration name."
  let (data, _region) ← readModuleData file
  let some decl := data.constants.find? (·.name.toString == name)
    | throw <| IO.userError "Declaration is absent from this compiled module."
  let proof := decl.value? (allowOpaque := true)
  IO.println <| (Json.mkObj [
    ("type", constantNames decl.type),
    ("value", (proof.map constantNames).getD Json.null)
  ]).compress
  return 0

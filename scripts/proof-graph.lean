import Lean
open Lean

def main (args : List String) : IO Unit := do
  for path in args do
    let (data, _) ← readModuleData path
    for decl in data.constants do
      let names := fun (e : Expr) => (e.getUsedConstants.map Name.toString).qsort (· < ·)
      IO.println (Json.arr #[toJson path, toJson decl.name.toString, toJson (names decl.type),
        toJson ((decl.value? (allowOpaque := true)).map names)]).compress

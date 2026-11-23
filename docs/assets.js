export async function packedIndex(name) {
  const path = "data/" + name + ".json";
  const plain = async () => {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Index unavailable");
    return response.json();
  };
  if (typeof DecompressionStream === "undefined") return plain();
  const response = await fetch(path + ".gz");
  if (!response.ok) return plain();
  // Some static hosts apply HTTP content decoding to the .gz file itself.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

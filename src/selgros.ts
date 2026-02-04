export async function runSelgrosSearch(keywords: string[]) {
  console.log("Selgros search called with:", keywords);

  // Platzhalter-Ergebnis (damit alles technisch funktioniert)
  return keywords.map((keyword) => ({
    keyword,
    products: [],
    note: "Selgros Bot ist verbunden (Platzhalter)"
  }));
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function csvToObjects(text) {
  const [headers = [], ...rows] = parseCsv(text);
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [String(header || "").trim(), row[index] ?? ""]))
  );
}

// Rows of the "projects" tab -> [{ project, description, ... }].
// Google's gviz endpoint silently returns the FIRST tab when the requested
// tab name does not exist, so insist on the columns the projects tab has.
export function projectsFromCsv(text) {
  const rows = csvToObjects(text).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), String(value).trim()]))
  );
  if (!rows.length || !("project" in rows[0]) || !("description" in rows[0])) {
    throw new Error("projects tab not found (expected 'project' and 'description' columns)");
  }
  return rows.filter((row) => row.project);
}

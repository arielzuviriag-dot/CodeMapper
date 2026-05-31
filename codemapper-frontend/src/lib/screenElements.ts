/* ============================================================
 * Front-end screen introspection — the "members" of a screen, analogous to a
 * Java class's fields/methods. Pure regex over the raw source so it works for
 * ANY front: HTML5, old HTML, JSP, JSX/TSX, Vue, Svelte. Best-effort and
 * null-tolerant — a weird file yields fewer elements, never an exception.
 * ============================================================ */

export interface ScreenForm {
  action: string;
  method: string;
}
export interface ScreenLink {
  href: string;
  label: string;
}
export interface ScreenInput {
  type: string;
  name: string;
}
export interface ScreenApiCall {
  verb: string;
  path: string;
}

export interface ScreenElements {
  forms: ScreenForm[];
  buttons: string[];
  links: ScreenLink[];
  inputs: ScreenInput[];
  /** Event handlers wired up (onClick/onSubmit/onChange…) — the actions. */
  handlers: string[];
  /** HTTP calls the screen makes (fetch/axios/jQuery/api client). */
  apiCalls: ScreenApiCall[];
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["'\`]([^"'\`]*)["'\`]`, "i"));
  return m ? m[1].trim() : null;
}

function uniq<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = key(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

/** Extract the interactive surface of a screen file from its source. */
export function extractScreenElements(source: string): ScreenElements {
  const src = source ?? "";

  // Forms — <form ... action=... method=...>
  const forms: ScreenForm[] = [];
  for (const m of src.matchAll(/<form\b([^>]*)>/gi)) {
    forms.push({
      action: attr(m[1], "action") ?? "(sin action)",
      method: (attr(m[1], "method") ?? "GET").toUpperCase(),
    });
  }

  // Buttons — <button>label</button>, <input type=submit value=...>, JSX <Button>
  const buttons: string[] = [];
  for (const m of src.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
    const label = m[1].replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "").trim();
    buttons.push(label || "(botón)");
  }
  for (const m of src.matchAll(/<input\b[^>]*type\s*=\s*["'`](submit|button)["'`][^>]*>/gi)) {
    buttons.push(attr(m[0], "value") ?? "(submit)");
  }
  for (const m of src.matchAll(/<Button\b[^>]*>([\s\S]*?)<\/Button>/g)) {
    const label = m[1].replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "").trim();
    buttons.push(label || "(Button)");
  }

  // Links — <a href=...>label</a>
  const links: ScreenLink[] = [];
  for (const m of src.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], "href");
    if (!href) continue;
    const label = m[2].replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "").trim();
    links.push({ href, label: label || href });
  }

  // Inputs — <input name=... type=...>
  const inputs: ScreenInput[] = [];
  for (const m of src.matchAll(/<input\b([^>]*)>/gi)) {
    const name = attr(m[1], "name");
    if (!name) continue;
    inputs.push({ name, type: attr(m[1], "type") ?? "text" });
  }

  // Event handlers — onClick={fn} / onclick="..." / onSubmit / onChange …
  const handlers: string[] = [];
  for (const m of src.matchAll(/\bon([A-Z][a-z]+)\s*=\s*\{?\s*["'`]?([^"'`}\s)]+)/g)) {
    handlers.push(`on${m[1]}: ${m[2]}`);
  }
  for (const m of src.matchAll(/\bon([a-z]+)\s*=\s*["']([^"']+)["']/g)) {
    // old HTML inline handlers (onclick="doX()")
    const code = m[2].trim().replace(/\s+/g, " ");
    handlers.push(`on${m[1]}: ${code.slice(0, 40)}`);
  }

  // API calls — same broad patterns as the backend scanner.
  const apiCalls: ScreenApiCall[] = [];
  for (const m of src.matchAll(
    /\b[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
  )) {
    apiCalls.push({ verb: m[1].toUpperCase(), path: m[2] });
  }
  for (const m of src.matchAll(/\b(?:fetch|axios)\s*\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    apiCalls.push({ verb: "", path: m[1] });
  }
  for (const m of src.matchAll(/\$\.(get|post)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi)) {
    apiCalls.push({ verb: m[1].toUpperCase(), path: m[2] });
  }

  return {
    forms: uniq(forms, (f) => f.method + " " + f.action),
    buttons: [...new Set(buttons)],
    links: uniq(links, (l) => l.href),
    inputs: uniq(inputs, (i) => i.name),
    handlers: [...new Set(handlers)],
    apiCalls: uniq(apiCalls, (c) => c.verb + " " + c.path),
  };
}

/** Whether a screen can be statically previewed in a sandboxed iframe. */
export function canSimulate(path: string): boolean {
  return /\.(html?|jsp)$/i.test(path);
}

/** Build a sandbox-safe HTML document to preview a screen "with no data".
 *  For JSP we strip server-side tags so the static markup renders. */
export function buildPreviewHtml(path: string, source: string): string {
  let html = source ?? "";
  if (/\.jsp$/i.test(path)) {
    html = html
      .replace(/<%@[\s\S]*?%>/g, "") // directives
      .replace(/<%[\s\S]*?%>/g, "") // scriptlets/expressions
      .replace(/\$\{[^}]*\}/g, "") // EL expressions
      .replace(/<jsp:[\s\S]*?>/g, "") // jsp action tags
      .replace(/<\/?[a-zA-Z]+:[^>]*>/g, ""); // custom taglibs (c:, s:, etc.)
  }
  // Neutralize live data fetching so the preview is static ("sin datos").
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  return html;
}

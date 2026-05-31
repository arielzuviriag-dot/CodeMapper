import { describe, it, expect } from "vitest";
import {
  buildPreviewHtml,
  canSimulate,
  extractScreenElements,
} from "@/lib/screenElements";

describe("extractScreenElements", () => {
  it("reads an old HTML form: action, method, inputs, submit button", () => {
    const html = `
      <form action="/admin/listUsers.do" method="post">
        <input name="q" type="text"/>
        <input type="submit" value="Buscar"/>
      </form>
      <a href="/home">Inicio</a>`;
    const el = extractScreenElements(html);
    expect(el.forms).toEqual([{ action: "/admin/listUsers.do", method: "POST" }]);
    expect(el.inputs).toContainEqual({ name: "q", type: "text" });
    expect(el.buttons).toContain("Buscar");
    expect(el.links).toContainEqual({ href: "/home", label: "Inicio" });
  });

  it("reads a React/JSX screen: button label, onClick handler, api call", () => {
    const jsx = `
      export default function UsersPage() {
        const load = () => api.get('/api/admin/users');
        return <button onClick={load}>Cargar</button>;
      }`;
    const el = extractScreenElements(jsx);
    expect(el.buttons).toContain("Cargar");
    expect(el.handlers.some((h) => h.startsWith("onClick"))).toBe(true);
    expect(el.apiCalls).toContainEqual({ verb: "GET", path: "/api/admin/users" });
  });

  it("catches fetch() and jQuery calls (any front)", () => {
    const src = `fetch('/data'); $.post('/save', {});`;
    const el = extractScreenElements(src);
    expect(el.apiCalls).toContainEqual({ verb: "", path: "/data" });
    expect(el.apiCalls).toContainEqual({ verb: "POST", path: "/save" });
  });

  it("simulates HTML/JSP, not compiled components", () => {
    expect(canSimulate("a/login.html")).toBe(true);
    expect(canSimulate("a/list.jsp")).toBe(true);
    expect(canSimulate("a/UsersPage.tsx")).toBe(false);
  });

  it("strips JSP server tags and scripts from the preview", () => {
    const jsp = `<%@ page %><div><% out.print(x); %>${"${user.name}"}<script>fetch('/x')</script>Hola</div>`;
    const html = buildPreviewHtml("x.jsp", jsp);
    expect(html).not.toContain("<%");
    expect(html).not.toContain("<script");
    expect(html).toContain("Hola");
  });
});

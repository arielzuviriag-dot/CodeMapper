// Demo driver — drives the "Bug" (exception investigation) flow slowly in a
// visible Chromium window so the user can watch each step. Standalone: uses
// the @playwright/test chromium that's already installed for the e2e suite.
import { chromium } from "@playwright/test";

const PROJECT_PATH = "C:\\Users\\ariel\\Reserva\\backend-reserva";
const MOBILE_PATH = "C:\\Users\\ariel\\Reserva\\reserva-mobile-app";

// A REAL exception: classic Spring/JPA NPE — an Integer column came back null
// from the DB and got unboxed. Line 115 of AppointmentService is exactly
// `startAt.plusMinutes(service.getDurationMinutes())`; called from line 229 of
// the controller.
const TRACE = `java.lang.NullPointerException: Cannot invoke "java.lang.Integer.intValue()" because the return value of "com.reserva.reservabackend.entity.BusinessService.getDurationMinutes()" is null
	at com.reserva.reservabackend.service.AppointmentService.create(AppointmentService.java:115)
	at com.reserva.reservabackend.controller.AppointmentController.create(AppointmentController.java:229)
	at java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)
	at java.base/java.lang.reflect.Method.invoke(Method.java:580)
	at org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:255)
	at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.invokeHandlerMethod(RequestMappingHandlerAdapter.java:808)`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 350, // every action visibly paced
    args: ["--start-maximized"],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log("1) Abriendo la home (demo PRO)...");
  await page.goto("http://localhost:3000?demo=pro", { waitUntil: "networkidle" });
  await sleep(2000);

  console.log("2) Click en la tab 'Bug'...");
  await page.getByRole("tab", { name: "Bug" }).click();
  await sleep(1500);

  const panel = page.locator('[role="tabpanel"][data-state="active"]');

  console.log("3) Escribiendo la ruta del proyecto Java...");
  const pathInput = panel.locator('input[type="text"]').nth(0);
  await pathInput.click();
  await pathInput.type(PROJECT_PATH, { delay: 10 });
  await sleep(800);

  console.log("3b) Escribiendo la ruta del proyecto Mobile (React Native)...");
  const mobileInput = panel.locator('input[type="text"]').nth(1);
  await mobileInput.click();
  await mobileInput.type(MOBILE_PATH, { delay: 10 });
  await sleep(1000);

  console.log("4) Pegando el stack trace real...");
  const textarea = panel.locator("textarea");
  await textarea.click();
  await textarea.fill(TRACE);
  await sleep(2000);

  console.log("5) Click en 'Investigar excepción'...");
  await panel.getByRole("button", { name: /Investigar excepción/i }).click();

  console.log("   ...esperando el mapa + Informe del error (analiza el proyecto)...");
  await page.getByText("Informe del error", { exact: false }).waitFor({
    state: "visible",
    timeout: 90000,
  });
  console.log("   Informe del error visible.");
  await sleep(4000);

  console.log("6) Mostrando el tren + el recorrido paso a paso del Informe...");
  await sleep(4000);

  console.log("7) Esperando el vagón de la PANTALLA MOBILE (el scan tarda)...");
  const screenNode = page
    .locator(".react-flow__node")
    .filter({ hasText: "book-appointment" })
    .first();
  let hasScreen = true;
  try {
    await screenNode.waitFor({ state: "visible", timeout: 30000 });
  } catch {
    hasScreen = false;
  }
  if (hasScreen) {
    console.log("   Click en la pantalla mobile → abre su código...");
    await screenNode.click();
    // El visor de código mobile debería abrirse a la derecha.
    try {
      await page
        .getByText("book-appointment.tsx", { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      console.log("   ✓ Visor de código mobile abierto.");
    } catch {
      console.log("   (no se confirmó el visor, sigo)");
    }
    await sleep(5000);
    await page.keyboard.press("Escape"); // cerrar el sheet
    await sleep(1500);
  } else {
    console.log("   (no encontré el nodo de la pantalla mobile)");
  }

  console.log("8b) Click en el último paso del recorrido (la causa raíz)...");
  const focusLink = page
    .getByRole("button", { name: /AppointmentService\.create/i })
    .first();
  if (await focusLink.count()) {
    await focusLink.click();
    await sleep(4000);
  }

  console.log("8) Listo. Dejo la ventana abierta para que la explores.");
  // Keep the window open ~3 min so the user can click around.
  await sleep(180000);

  await browser.close();
}

main().catch((e) => {
  console.error("demo error:", e);
  process.exit(1);
});

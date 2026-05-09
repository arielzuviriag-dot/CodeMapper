package com.codemapper.service;

import com.codemapper.model.dto.DiagnosticsExportRequest;
import com.codemapper.model.dto.UnresolvedReference;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Smoke runnable — genera dos PDFs con datos sintéticos (FREE y PRO) para
 * inspección visual del cap, badge y sección bloqueada. NO es un test JUnit
 * (no asserts) — invocar con: java -cp target/classes;target/test-classes \
 *   com.codemapper.service.DiagnosticsPdfSmokeTest
 *
 * Borrar este archivo cuando ya no se necesite.
 */
public class DiagnosticsPdfSmokeTest {

    public static void main(String[] args) throws Exception {
        // 65 sintéticos: 64 unresolved + 1 false_negative + 0 unparseable
        // (mismos números que el screenshot real de Ari)
        List<UnresolvedReference> diagnostics = new ArrayList<>();
        for (int i = 1; i <= 64; i++) {
            diagnostics.add(new UnresolvedReference(
                    UnresolvedReference.Kind.UNRESOLVED,
                    "C:/Users/ariel/Reserva/backend-reserva/src/main/java/com/reserva/reservabackend/service/Service" + i + ".java",
                    40 + i,
                    "userRepository.findById(id) // método " + i,
                    "Symbol could not be resolved"));
        }
        diagnostics.add(new UnresolvedReference(
                UnresolvedReference.Kind.FALSE_NEGATIVE,
                "C:/Users/ariel/Reserva/backend-reserva/src/main/java/com/reserva/reservabackend/util/Helper.java",
                0,
                "User",
                "Mention found, no symbol resolved"));

        DiagnosticsPdfService svc = new DiagnosticsPdfService();

        DiagnosticsExportRequest freeReq = new DiagnosticsExportRequest(
                "User",
                "com.reserva.reservabackend.entity.User",
                "backend-reserva",
                "17",
                false,  // FREE
                diagnostics);
        byte[] freePdf = svc.generatePdf(freeReq);
        Path freeOut = Path.of(System.getProperty("java.io.tmpdir"), "smoke-diagnostics-FREE.pdf");
        Files.write(freeOut, freePdf);
        System.out.println("FREE  → " + freeOut + "  (" + freePdf.length + " bytes)");

        DiagnosticsExportRequest proReq = new DiagnosticsExportRequest(
                "User",
                "com.reserva.reservabackend.entity.User",
                "backend-reserva",
                "17",
                true,   // PRO
                diagnostics);
        byte[] proPdf = svc.generatePdf(proReq);
        Path proOut = Path.of(System.getProperty("java.io.tmpdir"), "smoke-diagnostics-PRO.pdf");
        Files.write(proOut, proPdf);
        System.out.println("PRO   → " + proOut + "  (" + proPdf.length + " bytes)");
    }
}

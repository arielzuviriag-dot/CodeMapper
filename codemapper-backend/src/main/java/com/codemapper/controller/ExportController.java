package com.codemapper.controller;

import com.codemapper.model.dto.DiagnosticsExportRequest;
import com.codemapper.model.dto.FocoExportRequest;
import com.codemapper.model.dto.FocoMethodExportRequest;
import com.codemapper.service.DiagnosticsPdfService;
import com.codemapper.service.FocoMethodPdfService;
import com.codemapper.service.FocoPdfService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/foco/export")
@RequiredArgsConstructor
public class ExportController {

    private final FocoPdfService focoPdfService;
    private final FocoMethodPdfService focoMethodPdfService;
    private final DiagnosticsPdfService diagnosticsPdfService;

    /**
     * Renders a PDF report of the FOCO connections the user is currently
     * looking at. The frontend posts the data straight from its store —
     * NO re-analysis happens server-side, which guarantees the PDF mirrors
     * the UI (FREE limit included) and keeps the endpoint stateless.
     */
    @PostMapping(value = "/pdf",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportPdf(@RequestBody FocoExportRequest request) {
        if (request == null || request.getFocusClass() == null) {
            return ResponseEntity.badRequest().build();
        }
        byte[] pdf = focoPdfService.generatePdf(request);
        String name = request.getFocusClass().getName();
        if (name == null || name.isBlank()) name = "foco";
        String tier = request.isPro() ? "PRO" : "FREE";
        String filename = "codemapper-foco-" + name + "-" + tier + ".pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(pdf.length);
        log.info("Generated FOCO PDF for {} ({} bytes, {} connections, pro={})",
                name, pdf.length,
                request.getConnections() == null ? 0 : request.getConnections().size(),
                request.isPro());
        return new ResponseEntity<>(pdf, headers, 200);
    }

    /**
     * Renders a FOCO METHOD analysis result as a PDF report. Mirrors the
     * /pdf endpoint above but for the method-focus mode: the body shows
     * "QUIÉN LO INVOCA" and "A QUIÉN INVOCA" sections instead of a flat
     * connections list.
     */
    @PostMapping(value = "/method-pdf",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportMethodPdf(@RequestBody FocoMethodExportRequest request) {
        if (request == null || request.getFocusMethod() == null) {
            return ResponseEntity.badRequest().build();
        }
        byte[] pdf = focoMethodPdfService.generatePdf(request);
        String containing = request.getFocusMethod().getContainingClass();
        String method = request.getFocusMethod().getMethodName();
        if (containing == null || containing.isBlank()) containing = "foco";
        if (method == null || method.isBlank()) method = "metodo";
        String tier = request.isPro() ? "PRO" : "FREE";
        String filename = "codemapper-foco-metodo-" + containing + "-" + method
                + "-" + tier + ".pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(pdf.length);
        log.info("Generated FOCO METHOD PDF for {}.{} ({} bytes, {} connections, pro={})",
                containing, method, pdf.length,
                request.getConnections() == null ? 0 : request.getConnections().size(),
                request.isPro());
        return new ResponseEntity<>(pdf, headers, 200);
    }

    /**
     * Renders the contents of the DiagnosticsPanel as a PDF report. Same
     * stateless pattern as the FOCO export — frontend ships its current
     * findings and the backend formats them.
     */
    @PostMapping(value = "/diagnostics-pdf",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportDiagnosticsPdf(@RequestBody DiagnosticsExportRequest request) {
        if (request == null) {
            return ResponseEntity.badRequest().build();
        }
        byte[] pdf = diagnosticsPdfService.generatePdf(request);
        String name = request.getFocusName();
        if (name == null || name.isBlank()) name = "foco";
        String tier = request.isPro() ? "PRO" : "FREE";
        String filename = "codemapper-diagnostico-" + name + "-" + tier + ".pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(pdf.length);
        log.info("Generated diagnostics PDF for {} ({} bytes, {} findings, pro={})",
                name, pdf.length,
                request.getDiagnostics() == null ? 0 : request.getDiagnostics().size(),
                request.isPro());
        return new ResponseEntity<>(pdf, headers, 200);
    }
}

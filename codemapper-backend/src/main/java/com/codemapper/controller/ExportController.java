package com.codemapper.controller;

import com.codemapper.model.dto.FocoExportRequest;
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
        String filename = "codemapper-foco-" + name + ".pdf";

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
}

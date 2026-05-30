package com.codemapper.service;

import com.codemapper.model.dto.trace.TraceExportRequest;
import com.codemapper.model.dto.trace.TraceExportRequest.TraceNodeDto;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;

/**
 * Renders the "Escuchando" (live trace) graph as a printable PDF. Stateless,
 * mirroring {@link FocoPdfService}: it receives the on-screen nodes + a PNG
 * snapshot and only formats them. The body is a detail table — per object:
 * execution order, Web/Java type, and how many times it was called.
 */
@Slf4j
@Service
public class TracePdfService {

    private static final Color BORDO = new Color(185, 28, 66);
    private static final Color BODY = new Color(20, 20, 20);
    private static final Color MUTED = new Color(110, 110, 115);
    private static final Color HAIRLINE = new Color(200, 200, 205);
    private static final Color ROW_ALT = new Color(245, 245, 247);
    private static final Color ERROR_RED = new Color(220, 38, 38);

    private static final DateTimeFormatter HUMAN_TS = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss z");

    public byte[] generatePdf(TraceExportRequest req) {
        List<TraceNodeDto> nodes = req.getNodes() == null
                ? List.of() : new ArrayList<>(req.getNodes());
        // List in execution order (the badge the user reads as 1 → 2 → 3 …).
        nodes.sort(Comparator.comparingInt(TraceNodeDto::getOrder));

        Document doc = new Document(PageSize.A4, 42, 42, 70, 50);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(doc, out);
        writer.setPageEvent(new HeaderFooter());

        try {
            doc.open();

            doc.add(titleParagraph("Reporte Escuchando"));
            doc.add(subtitleParagraph(req));
            doc.add(spacer(8));

            // ── Summary ───────────────────────────────────────────────
            doc.add(sectionHeader("Resumen"));
            doc.add(summaryParagraph(req, nodes));
            doc.add(spacer(10));

            // ── On-screen snapshot ────────────────────────────────────
            Image snapshot = decodeImage(req.getImageBase64());
            if (snapshot != null) {
                doc.add(sectionHeader("Lo que se ve en pantalla"));
                float maxW = doc.getPageSize().getWidth() - doc.leftMargin() - doc.rightMargin();
                // Scale to the available width, never upscaling past it.
                snapshot.scaleToFit(maxW, 360);
                snapshot.setAlignment(Element.ALIGN_CENTER);
                doc.add(snapshot);
                doc.add(spacer(12));
            }

            // ── Detail table ──────────────────────────────────────────
            doc.add(sectionHeader("Detalle por objeto (orden de ejecución)"));
            if (nodes.isEmpty()) {
                doc.add(bodyParagraph("No hay objetos en pantalla para reportar."));
            } else {
                doc.add(detailTable(nodes));
            }

        } catch (Exception e) {
            log.error("Failed to generate Escuchando PDF", e);
            throw new RuntimeException("PDF generation failed: " + e.getMessage(), e);
        } finally {
            try { doc.close(); } catch (Exception ignored) {}
        }
        return out.toByteArray();
    }

    // ───────────────────────────── table ─────────────────────────────

    private PdfPTable detailTable(List<TraceNodeDto> nodes) {
        // Orden · Objeto · Tipo · Llamadas
        PdfPTable table = new PdfPTable(new float[]{1.2f, 6.5f, 1.6f, 1.6f});
        table.setWidthPercentage(100);
        table.setSpacingBefore(4);

        addHeaderCell(table, "Orden");
        addHeaderCell(table, "Objeto");
        addHeaderCell(table, "Tipo");
        addHeaderCell(table, "Llamadas");

        int row = 0;
        for (TraceNodeDto n : nodes) {
            Color bg = (row++ % 2 == 0) ? Color.WHITE : ROW_ALT;
            boolean error = "ERROR".equalsIgnoreCase(n.getStatus());

            table.addCell(bodyCell(String.valueOf(n.getOrder()), bg, Element.ALIGN_CENTER,
                    font(10, true, error ? ERROR_RED : MUTED)));

            // Object cell: name (+ fqcn / methods as smaller sub-lines).
            PdfPCell obj = new PdfPCell();
            obj.setBackgroundColor(bg);
            obj.setPadding(5);
            obj.setBorderColor(HAIRLINE);
            Paragraph name = new Paragraph();
            name.add(new Chunk(safeStr(n.getClassName()),
                    font(10, true, error ? ERROR_RED : BODY)));
            if (error) name.add(new Chunk("  ● ERROR", font(8, true, ERROR_RED)));
            obj.addElement(name);
            if (n.getFqcn() != null && !n.getFqcn().isBlank()) {
                obj.addElement(new Paragraph(n.getFqcn(), monoFont(7.5f, MUTED)));
            }
            if (n.getMethods() != null && !n.getMethods().isEmpty()) {
                obj.addElement(new Paragraph(String.join("  ·  ", n.getMethods()),
                        monoFont(8, BODY)));
            }
            table.addCell(obj);

            table.addCell(bodyCell(n.isHttp() ? "Web" : "Java", bg, Element.ALIGN_CENTER,
                    font(9, true, n.isHttp() ? MUTED : BORDO)));
            table.addCell(bodyCell(n.getHitCount() + "×", bg, Element.ALIGN_CENTER,
                    font(10, true, BODY)));
        }
        return table;
    }

    private void addHeaderCell(PdfPTable table, String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text.toUpperCase(),
                font(9, true, Color.WHITE)));
        cell.setBackgroundColor(BORDO);
        cell.setPadding(6);
        cell.setBorderColor(BORDO);
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        table.addCell(cell);
    }

    private PdfPCell bodyCell(String text, Color bg, int align, Font font) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(bg);
        cell.setPadding(5);
        cell.setBorderColor(HAIRLINE);
        cell.setHorizontalAlignment(align);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        return cell;
    }

    // ───────────────────────────── header blocks ─────────────────────

    private Paragraph titleParagraph(String text) {
        Paragraph p = new Paragraph(text, font(20, true, BORDO));
        p.setSpacingAfter(2);
        return p;
    }

    private Paragraph subtitleParagraph(TraceExportRequest req) {
        Paragraph p = new Paragraph();
        p.add(new Chunk("Recorrido en vivo capturado por OpenTelemetry",
                font(11, false, BODY)));
        String root = req.getRootClassName();
        if (root != null && !root.isBlank()) {
            p.add(new Chunk("\nEntrada: " + root, monoFont(9, MUTED)));
        }
        p.setSpacingAfter(6);
        return p;
    }

    private Paragraph sectionHeader(String text) {
        Paragraph p = new Paragraph(text.toUpperCase(), font(11, true, BORDO));
        p.setSpacingBefore(6);
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph summaryParagraph(TraceExportRequest req, List<TraceNodeDto> nodes) {
        long web = nodes.stream().filter(TraceNodeDto::isHttp).count();
        long java = nodes.size() - web;
        int totalCalls = nodes.stream().mapToInt(TraceNodeDto::getHitCount).sum();

        Paragraph p = new Paragraph();
        p.add(new Chunk("Vista: ", font(10, false, MUTED)));
        p.add(new Chunk(viewLabel(req.getView()), font(10, true, BODY)));
        p.add(new Chunk("    Filtro URL: ", font(10, false, MUTED)));
        String filter = req.getUrlFilter();
        p.add(new Chunk((filter == null || filter.isBlank()) ? "(todo)" : filter,
                font(10, true, BODY)));
        p.add(new Chunk("\nObjetos: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(nodes.size()), font(10, true, BODY)));
        p.add(new Chunk("    Web: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(web), font(10, true, BODY)));
        p.add(new Chunk("    Java: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(java), font(10, true, BODY)));
        p.add(new Chunk("    Llamadas totales: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(totalCalls), font(10, true, BODY)));
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph bodyParagraph(String text) {
        Paragraph p = new Paragraph(text, font(10, false, BODY));
        p.setSpacingAfter(2);
        return p;
    }

    private Paragraph spacer(float height) {
        Paragraph p = new Paragraph(" ", font(1, false, BODY));
        p.setSpacingAfter(height);
        return p;
    }

    // ───────────────────────────── helpers ───────────────────────────

    /** Decode a data-URL or bare base64 PNG into an OpenPDF Image, or null. */
    private Image decodeImage(String imageBase64) {
        if (imageBase64 == null || imageBase64.isBlank()) return null;
        try {
            String b64 = imageBase64;
            int comma = b64.indexOf(',');
            if (b64.startsWith("data:") && comma >= 0) {
                b64 = b64.substring(comma + 1);
            }
            byte[] bytes = Base64.getDecoder().decode(b64.trim());
            return Image.getInstance(bytes);
        } catch (Exception e) {
            // A bad/oversized snapshot must never sink the whole report.
            log.warn("Could not embed graph snapshot in PDF: {}", e.getMessage());
            return null;
        }
    }

    private String viewLabel(String view) {
        if (view == null) return "Todo";
        return switch (view.toLowerCase()) {
            case "web" -> "Web (entradas HTTP)";
            case "java" -> "Java (clases)";
            default -> "Todo";
        };
    }

    private static String safeStr(String s) {
        return s == null ? "" : s;
    }

    private Font font(float size, boolean bold, Color color) {
        return FontFactory.getFont(FontFactory.HELVETICA, size,
                bold ? Font.BOLD : Font.NORMAL, color);
    }

    private Font monoFont(float size, Color color) {
        return FontFactory.getFont(FontFactory.COURIER, size, Font.NORMAL, color);
    }

    // ───────────────────────────── header / footer ───────────────────

    /** App header + page X/Y footer on every page (same trick as FocoPdfService). */
    private static class HeaderFooter extends PdfPageEventHelper {
        private PdfTemplate totalPageTemplate;
        private final String dateString =
                ZonedDateTime.now(ZoneId.systemDefault()).format(HUMAN_TS);

        @Override
        public void onOpenDocument(PdfWriter writer, Document document) {
            totalPageTemplate = writer.getDirectContent().createTemplate(35, 12);
        }

        @Override
        public void onEndPage(PdfWriter writer, Document doc) {
            PdfContentByte cb = writer.getDirectContent();
            Rectangle ps = doc.getPageSize();
            float right = ps.getWidth() - 42;
            float top = ps.getHeight() - 28;
            float bottom = 30;

            Phrase appName = new Phrase("CodeMapper — Reporte Escuchando",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, BORDO));
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, appName, 42, top, 0);

            Phrase ctx = new Phrase(dateString,
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, ctx, right, top, 0);

            cb.setColorStroke(HAIRLINE);
            cb.setLineWidth(0.4f);
            cb.moveTo(42, top - 6);
            cb.lineTo(right, top - 6);
            cb.stroke();

            Phrase footerLeft = new Phrase("Generado con CodeMapper",
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, footerLeft, 42, bottom, 0);

            Phrase pageX = new Phrase("Página " + writer.getPageNumber() + " / ",
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            float centerX = ps.getWidth() / 2f;
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, pageX, centerX + 8, bottom, 0);
            cb.addTemplate(totalPageTemplate, centerX + 10, bottom - 1);
        }

        @Override
        public void onCloseDocument(PdfWriter writer, Document document) {
            ColumnText.showTextAligned(totalPageTemplate, Element.ALIGN_LEFT,
                    new Phrase(String.valueOf(writer.getPageNumber() - 1),
                            FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED)),
                    0, 1, 0);
        }
    }
}

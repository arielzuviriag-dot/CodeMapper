package com.codemapper.service;

import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.dto.FocoExportRequest;
import com.codemapper.model.event.FocusClassLoadedEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Renders a FOCO analysis result as a printable PDF. Stateless — receives
 * the data the user is currently looking at (already truncated by FREE if
 * applicable) and produces bytes. No re-analysis, no I/O beyond writing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FocoPdfService {

    /** Bordó — same hex as the design tokens. Prints as a dark, readable tone in B/W. */
    private static final Color BORDO = new Color(185, 28, 66);
    private static final Color BODY = new Color(20, 20, 20);
    private static final Color MUTED = new Color(110, 110, 115);
    private static final Color HAIRLINE = new Color(200, 200, 205);

    private static final DateTimeFormatter HUMAN_TS = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss z");

    private final FocoCommentEngine commentEngine;

    public byte[] generatePdf(FocoExportRequest req) {
        FocusClassLoadedEvent focus = req.getFocusClass();
        List<FocusConnectionEvent> conns = req.getConnections() == null
                ? List.of() : req.getConnections();

        Document doc = new Document(PageSize.A4, 42, 42, 70, 50);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(doc, out);
        HeaderFooter handler = new HeaderFooter(focus, req.isPro());
        writer.setPageEvent(handler);

        try {
            doc.open();

            // ── Title block ───────────────────────────────────────────
            doc.add(titleParagraph("Reporte FOCO"));
            doc.add(subtitleParagraph(focus));
            doc.add(spacer(10));

            // ── Summary ──────────────────────────────────────────────
            doc.add(sectionHeader("Resumen"));
            doc.add(summaryParagraph(req, conns));
            if (req.isLimitApplied()) {
                doc.add(noticeParagraph(
                        "Mostrando " + conns.size() + " de " + req.getTotalAvailable()
                                + " conexiones detectadas. Activá PRO para ver toda la cadena."));
            }
            for (String c : commentEngine.summaryComments(conns, focus)) {
                doc.add(bulletParagraph(c));
            }
            doc.add(typeBreakdownParagraph(conns));
            doc.add(spacer(14));

            // ── Connection list ───────────────────────────────────────
            doc.add(sectionHeader("Conexiones de Nivel 1"));
            if (conns.isEmpty()) {
                doc.add(bodyParagraph(
                        "Sin conexiones detectadas en este nivel."));
            } else {
                for (int i = 0; i < conns.size(); i++) {
                    addConnectionBlock(doc, conns.get(i), focus, i + 1);
                }
            }

        } catch (Exception e) {
            log.error("Failed to generate FOCO PDF", e);
            throw new RuntimeException("PDF generation failed: " + e.getMessage(), e);
        } finally {
            try { doc.close(); } catch (Exception ignored) {}
        }
        return out.toByteArray();
    }

    // ───────────────────────────── building blocks ─────────────────────

    private void addConnectionBlock(Document doc,
                                    FocusConnectionEvent conn,
                                    FocusClassLoadedEvent focus,
                                    int index) throws Exception {
        // separator + index
        Paragraph titleLine = new Paragraph();
        titleLine.add(new Chunk("[" + index + "] ", font(11, true, MUTED)));
        titleLine.add(new Chunk(safeStr(conn.getName()), font(12, true, BORDO)));
        titleLine.add(new Chunk("   " + connectionTypeLabel(conn.getConnectionType()),
                font(9, true, MUTED)));
        titleLine.setSpacingBefore(8);
        titleLine.setSpacingAfter(2);
        doc.add(titleLine);

        // FQN (monospace)
        Paragraph fqn = new Paragraph(safeStr(conn.getFullyQualifiedName()),
                monoFont(9, BODY));
        fqn.setSpacingAfter(2);
        doc.add(fqn);

        // direction
        String origin;
        String destination;
        switch (conn.getConnectionType()) {
            case CALLED_BY, INVOKES_METHOD -> {
                origin = safeStr(conn.getName());
                destination = safeStr(focus.getName());
            }
            default -> {
                origin = safeStr(focus.getName());
                destination = safeStr(conn.getName());
            }
        }
        Paragraph direction = new Paragraph();
        direction.add(new Chunk("Origen → Destino: ", font(9, false, MUTED)));
        direction.add(new Chunk(origin + " → " + destination, monoFont(9, BODY)));
        direction.setSpacingAfter(2);
        doc.add(direction);

        // source file
        if (conn.getSourceFile() != null && !conn.getSourceFile().isBlank()) {
            Paragraph srcLine = new Paragraph();
            srcLine.add(new Chunk("Archivo: ", font(9, false, MUTED)));
            srcLine.add(new Chunk(conn.getSourceFile(), monoFont(8, BODY)));
            srcLine.setSpacingAfter(2);
            doc.add(srcLine);
        }

        // counts
        int fields = conn.getFields() == null ? 0 : conn.getFields().size();
        int methods = conn.getMethods() == null ? 0 : conn.getMethods().size();
        Paragraph counts = new Paragraph(
                fields + " campos · " + methods + " métodos",
                font(9, false, MUTED));
        counts.setSpacingAfter(2);
        doc.add(counts);

        // comments
        List<String> comments = commentEngine.commentsFor(conn, focus);
        for (String c : comments) {
            doc.add(bulletParagraph(c));
        }
    }

    private Paragraph titleParagraph(String text) {
        Paragraph p = new Paragraph(text, font(20, true, BORDO));
        p.setSpacingAfter(2);
        return p;
    }

    private Paragraph subtitleParagraph(FocusClassLoadedEvent focus) {
        Paragraph p = new Paragraph();
        p.add(new Chunk(safeStr(focus.getName()), font(13, true, BODY)));
        p.add(new Chunk("\n" + safeStr(focus.getFullyQualifiedName()),
                monoFont(9, MUTED)));
        p.setSpacingAfter(6);
        return p;
    }

    private Paragraph sectionHeader(String text) {
        Paragraph p = new Paragraph(text.toUpperCase(),
                font(11, true, BORDO));
        p.setSpacingBefore(6);
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph summaryParagraph(FocoExportRequest req,
                                       List<FocusConnectionEvent> conns) {
        Paragraph p = new Paragraph();
        p.add(new Chunk("Plan: ", font(10, false, MUTED)));
        p.add(new Chunk(req.isPro() ? "PRO" : "FREE",
                font(10, true, req.isPro() ? BODY : BORDO)));
        p.add(new Chunk("    Profundidad: 1", font(10, false, BODY)));
        p.add(new Chunk("    Conexiones: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(conns.size()), font(10, true, BODY)));
        if (req.isLimitApplied()) {
            p.add(new Chunk(" / " + req.getTotalAvailable() + " detectadas",
                    font(10, false, MUTED)));
        }
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph typeBreakdownParagraph(List<FocusConnectionEvent> conns) {
        Map<FocusConnectionType, Integer> counts = new HashMap<>();
        for (FocusConnectionEvent c : conns) {
            if (c.getConnectionType() == null) continue;
            counts.merge(c.getConnectionType(), 1, Integer::sum);
        }
        if (counts.isEmpty()) {
            return spacer(0);
        }
        StringBuilder sb = new StringBuilder("Por tipo:  ");
        boolean first = true;
        for (FocusConnectionType t : FocusConnectionType.values()) {
            Integer n = counts.get(t);
            if (n == null) continue;
            if (!first) sb.append("  ·  ");
            sb.append(connectionTypeLabel(t)).append(": ").append(n);
            first = false;
        }
        Paragraph p = new Paragraph(sb.toString(), font(9, false, MUTED));
        p.setSpacingAfter(2);
        return p;
    }

    private Paragraph noticeParagraph(String text) {
        Paragraph p = new Paragraph();
        p.add(new Chunk("⚠ ", font(10, true, BORDO)));
        p.add(new Chunk(text, font(10, false, BODY)));
        p.setSpacingBefore(2);
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph bulletParagraph(String text) {
        Paragraph p = new Paragraph();
        p.add(new Chunk("•  ", font(9, true, BORDO)));
        p.add(new Chunk(text, font(9, false, BODY)));
        p.setIndentationLeft(8);
        p.setSpacingAfter(1);
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

    // ───────────────────────────── fonts ─────────────────────────────

    private Font font(float size, boolean bold, Color color) {
        int style = bold ? Font.BOLD : Font.NORMAL;
        return FontFactory.getFont(FontFactory.HELVETICA, size, style, color);
    }

    private Font monoFont(float size, Color color) {
        return FontFactory.getFont(FontFactory.COURIER, size, Font.NORMAL, color);
    }

    // ───────────────────────────── helpers ───────────────────────────

    private static String safeStr(String s) {
        return s == null ? "" : s;
    }

    private static String connectionTypeLabel(FocusConnectionType t) {
        if (t == null) return "";
        return switch (t) {
            case CALLS -> "LLAMA A";
            case CALLED_BY -> "LLAMADO POR";
            case EXTENDS -> "EXTIENDE";
            case IMPLEMENTS -> "IMPLEMENTA";
            case USES_PROPERTIES -> "USA PROPS";
            case INVOKES_METHOD -> "INVOCA MÉTODO";
            case INVOKES_OUTGOING -> "INVOCA A";
        };
    }

    // ───────────────────────────── header / footer ───────────────────

    /**
     * Header (project + date + plan) and footer (page X / Y) on every page.
     * Uses the standard "reserve template, fill on close" trick to know the
     * total page count without rendering twice.
     */
    private static class HeaderFooter extends PdfPageEventHelper {
        private final FocusClassLoadedEvent focus;
        private final boolean pro;
        private PdfTemplate totalPageTemplate;
        private final String dateString;

        HeaderFooter(FocusClassLoadedEvent focus, boolean pro) {
            this.focus = focus;
            this.pro = pro;
            this.dateString = ZonedDateTime.now(ZoneId.systemDefault()).format(HUMAN_TS);
        }

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

            // Header — left: app name, right: date · plan · class
            Phrase appName = new Phrase("CodeMapper — Reporte FOCO",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, BORDO));
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, appName, 42, top, 0);

            String planTag = pro ? "PRO" : "FREE";
            String focusName = focus == null ? "" : Objects.toString(focus.getName(), "");
            Phrase ctx = new Phrase(dateString + "  ·  " + planTag + "  ·  " + focusName,
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, ctx, right, top, 0);

            // Hairline under header
            cb.setColorStroke(HAIRLINE);
            cb.setLineWidth(0.4f);
            cb.moveTo(42, top - 6);
            cb.lineTo(right, top - 6);
            cb.stroke();

            // Footer — left: app, center: page X / Y
            Phrase footerLeft = new Phrase("Generado con CodeMapper",
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, footerLeft, 42, bottom, 0);

            Phrase pageX = new Phrase("Página " + writer.getPageNumber() + " / ",
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            float centerX = ps.getWidth() / 2f;
            float pageXWidth = pageX.getContent().length() * 4f; // rough offset
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, pageX, centerX + 8, bottom, 0);
            // The total goes into the reserved template
            cb.addTemplate(totalPageTemplate, centerX + 10, bottom - 1);
        }

        @Override
        public void onCloseDocument(PdfWriter writer, Document document) {
            // Fill the reserved template with the total page count
            ColumnText.showTextAligned(totalPageTemplate, Element.ALIGN_LEFT,
                    new Phrase(String.valueOf(writer.getPageNumber() - 1),
                            FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED)),
                    0, 1, 0);
        }
    }
}
